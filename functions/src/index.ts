import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
import fetch from 'node-fetch'
import { CallableContext } from 'firebase-functions/lib/providers/https'
import { Challenge } from './models'
import './init'

const functionConfig = functions.config() as {
  app: {
    // eslint-disable-next-line camelcase
    api_key: string
  }
}
const db = firebase.firestore()

const {
  coerceToBase64Url,
  coerceToArrayBuffer
} = require('fido2-lib/lib/utils')
const { Fido2Lib } = require('fido2-lib')

const GCP_PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'k2webauthn'
const HOSTNAME = `${GCP_PROJECT}.web.app`
const CHALLENGE_SIZE = 32

const f2l = new Fido2Lib({
  timeout: 30 * 1000 * 60,
  rpId: HOSTNAME,
  rpName: 'FIDO2 Demo',
  challengeSize: CHALLENGE_SIZE,
  cryptoParams: [-7]
})

type getIIDInfoResult = {
  id: string
  applicationVersion: string
  application: string
  scope: string
  authorizedEntity: string
  appSigner: string
  platform: string
}

async function getIIDInfo (instanceIdToken: string): Promise<getIIDInfoResult> {
  return fetch(`https://iid.googleapis.com/iid/info/${instanceIdToken}?details=true`, {
    headers: {
      Authorization: `key=${functionConfig.app.api_key}`
    }
  })
    .then(res => res.json())
    .then((res: getIIDInfoResult) => {
      const part = instanceIdToken.split(':')
      res.id = part[0]
      return res
    })
}

// function checkAuth (context: CallableContext) {
//   const { auth } = context
//   if (!auth) {
//     throw new functions.https.HttpsError('permission-denied', '')
//   }
//   const token = auth.token as firebase.auth.DecodedIdToken & {
//     email: string
//     // eslint-disable-next-line camelcase
//     email_verified: boolean
//   }

//   if (!token.email_verified) {
//     throw new functions.https.HttpsError('permission-denied', 'Unverified email')
//   }

//   return {
//     auth,
//     token
//   }
// }

export const registerRequest = functions.https.onCall(async (data: object | null, context: CallableContext) => {
  const { instanceIdToken } = context
  if (!instanceIdToken) {
    throw new functions.https.HttpsError('invalid-argument', 'instanceIdToken is empty')
  }

  try {
    const iid = await getIIDInfo(instanceIdToken)
    const response = await f2l.attestationOptions()
    const challenge = coerceToBase64Url(response.challenge, 'challenge')
    await db.doc(`/challenges/${iid.id}`)
      .withConverter(Challenge)
      .set({
        type: 'registration',
        challenge
      })

    return {
      challenge
    }
  } catch (err) {
    if (!(err instanceof functions.https.HttpsError)) {
      console.error(`${err.message}`, err)
      throw new functions.https.HttpsError('internal', 'Internal error')
    }
    throw err
  }
})

type Credential = {
  user: string
  credId: string
  publicKey: any
  aaguid: string
  prevCounter: any
  transports: string[]
  created: FirebaseFirestore.FieldValue
}

type RegisterResponseOption = {
  rawId: string
  credentialId: string
  clientDataJSON: string
  attestationObject: string
  apkSigSha256?: string
}

function isRegisterResponseOption (data: any | null): data is RegisterResponseOption {
  return data
    ? typeof data.rawId === 'string' &&
    typeof data.credentialId === 'string' &&
    typeof data.clientDataJSON === 'string' &&
    typeof data.attestationObject === 'string'
    : false
}

export const registerResponse = functions.https.onCall(async (data: RegisterResponseOption | null, context: CallableContext) => {
  if (!isRegisterResponseOption(data)) {
    console.warn('invalid-argument', data)
    throw new functions.https.HttpsError('invalid-argument', ` ${data}`)
  }

  const { instanceIdToken, auth } = context
  if (!instanceIdToken) {
    throw new functions.https.HttpsError('invalid-argument', 'instanceIdToken is empty')
  }

  const iid = await getIIDInfo(instanceIdToken)
  const challengeRef = db.doc(`/challenges/${iid.id}`)
  const challengeSnap = await challengeRef.withConverter(Challenge).get()

  if (!challengeSnap.exists) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid challenge')
  }

  const challengeDoc = challengeSnap.data()!

  const { rawId, clientDataJSON, attestationObject } = data

  try {
    const clientAttestationResponse = {
      rawId: coerceToArrayBuffer(rawId, 'rawId'),
      response: {
        clientDataJSON: coerceToArrayBuffer(clientDataJSON, 'clientDataJSON'),
        attestationObject: coerceToArrayBuffer(attestationObject, 'attestationObject')
      }
    }

    let origin = `https://${HOSTNAME}`
    if (data.apkSigSha256) {
      origin = `android:apk-key-hash:${data.apkSigSha256}`
    }

    const attestationExpectations = {
      challenge: coerceToArrayBuffer(challengeDoc.challenge, 'challenge'),
      origin: origin,
      factor: 'either'
    }

    const result = await f2l.attestationResult(clientAttestationResponse, attestationExpectations, {
      android: {
        rpId: HOSTNAME
      }
    })

    // console.log('attestationResult', result)

    let uid = ''
    if (auth) {
      uid = auth.uid
    } else {
      const user = await firebase.auth().createUser({})
      uid = user.uid
    }

    const transports: string[] = []
    switch (result.authnrData.get('fmt')) {
      case 'fido-u2f':
        transports.push('usb')
        break
      default:
        transports.push('internal')
    }

    const credential: Credential = {
      user: uid,
      credId: coerceToBase64Url(result.authnrData.get('credId'), 'credId'),
      publicKey: result.authnrData.get('credentialPublicKeyPem'),
      aaguid: coerceToBase64Url(result.authnrData.get('aaguid'), 'aaguid'),
      prevCounter: result.authnrData.get('counter'),
      transports,
      created: firebase.firestore.FieldValue.serverTimestamp()
    }

    console.log('registerKey', {
      uid: uid,
      credId: credential.credId,
      aaguid: credential.aaguid
    })

    const credentialRef = db.doc(`/instanceId/${iid.id}/credentials/${credential.credId}`)
    await credentialRef.create(credential)

    const token = await firebase.auth().createCustomToken(uid, {
      webauthn: true
    })

    return {
      token,
      credentialId: credential.credId
    }
  } catch (err) {
    console.error('@@@', err)
  } finally {
    challengeRef.delete()
  }

  return {}
})

export const signInRequest = functions.https.onCall(async (data: object | null, context: CallableContext) => {
  const { instanceIdToken } = context
  if (!instanceIdToken) {
    throw new functions.https.HttpsError('invalid-argument', 'instanceIdToken is empty')
  }

  try {
    const iid = await getIIDInfo(instanceIdToken)
    const response = await f2l.assertionOptions()
    const challenge = coerceToBase64Url(response.challenge, 'challenge')
    const credentialsSnap = await db.collection(`/instanceId/${iid.id}/credentials`).get()
    if (credentialsSnap.size === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'credentials is empty')
    }

    type allowCredential = {
      credId: string
      type: 'public-key',
      transports: string[]
    }
    const allowCredentials: allowCredential[] = []
    credentialsSnap.forEach(doc => {
      const cred = doc.data() as Credential
      allowCredentials.push({
        credId: cred.credId,
        type: 'public-key',
        transports: cred.transports
      })
    })

    await db.doc(`/challenges/${iid.id}`)
      .withConverter(Challenge)
      .set({
        type: 'authentication',
        challenge
      })

    const res = {
      challenge,
      allowCredentials
    }

    // console.log('@@@', res)

    return res
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err
    }
    throw new functions.https.HttpsError('invalid-argument', err.message)
  }
})

type SignInResponseOption = {
  type: string,
  rawId: string
  clientDataJSON: string
  authenticatorData: string
  signature: string
  userHandle?: string
  apkSigSha256?: string
}

function isSignInResponseOption (data: any | null): data is SignInResponseOption {
  return data
    ? typeof data.rawId === 'string' &&
    typeof data.clientDataJSON === 'string' &&
    typeof data.authenticatorData === 'string' &&
    typeof data.signature === 'string'
    : false
}

export const signInResponse = functions.https.onCall(async (data: object | null, context: CallableContext) => {
  if (!isSignInResponseOption(data)) {
    console.warn('invalid-argument', data)
    throw new functions.https.HttpsError('invalid-argument', ` ${data}`)
  }

  const { instanceIdToken } = context
  if (!instanceIdToken) {
    throw new functions.https.HttpsError('invalid-argument', 'instanceIdToken is empty')
  }

  const iid = await getIIDInfo(instanceIdToken)
  const challengeRef = db.doc(`/challenges/${iid.id}`)

  try {
    const challengeSnap = await challengeRef.withConverter(Challenge).get()
    if (!challengeSnap.exists) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid challenge')
    }
    const { challenge } = challengeSnap.data()!!

    const { rawId, clientDataJSON, authenticatorData, signature, userHandle, apkSigSha256 } = data
    const credentialsSnap = await db.collectionGroup('credentials').where('credId', '==', rawId).limit(1).get()
    if (credentialsSnap.size === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid rawId')
    }

    const credentialSnap = credentialsSnap.docs[0]
    const credential = credentialSnap.data() as Credential

    // console.log('@@@', data)
    const clientAssertionResponse = {
      rawId: coerceToArrayBuffer(rawId, 'rawId'),
      response: {
        clientDataJSON: coerceToArrayBuffer(clientDataJSON, 'clientDataJSON'),
        authenticatorData: coerceToArrayBuffer(authenticatorData, 'authenticatorData'),
        signature: coerceToArrayBuffer(signature, 'signature'),
        userHandle: userHandle != null ? coerceToArrayBuffer(userHandle, 'userHandle') : undefined
      }
    }

    let origin = `https://${HOSTNAME}`
    if (apkSigSha256) {
      origin = `android:apk-key-hash:${apkSigSha256}`
    }

    const assertionExpectations = {
      challenge,
      origin: origin,
      factor: 'either',
      publicKey: credential.publicKey,
      prevCounter: credential.prevCounter,
      userHandle: coerceToArrayBuffer(iid.id, 'userHandle')
    }
    const result = await f2l.assertionResult(clientAssertionResponse, assertionExpectations, {
      android: {
        rpId: HOSTNAME
      }
    })

    credential.prevCounter = result.authnrData.get('counter')
    await credentialSnap.ref.set(credential)

    const token = await firebase.auth().createCustomToken(credential.user, {
      webauthn: true
    })

    return {
      token
    }
  } catch (err) {
    if (err instanceof functions.https.HttpsError) {
      throw err
    }
    console.error(err)
    throw new functions.https.HttpsError('invalid-argument', err.message)
  } finally {
    await challengeRef.delete()
  }
})
