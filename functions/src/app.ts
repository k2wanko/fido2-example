// import * as express from 'express'
// import * as morgan from 'morgan'
// import * as firebase from 'firebase-admin'
// import { wrap, csrfCheck } from './lib/expressutil'
// const { Fido2Lib } = require('fido2-lib')
// const {
//   coerceToBase64Url,
//   coerceToArrayBuffer
// } = require('fido2-lib/lib/utils')

// const GCP_PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'k2fido2example'
// const HOSTNAME = `${GCP_PROJECT}.web.app`
// const CHALLENGE_SIZE = 32

// const fido = new Fido2Lib({
//   timeout: 30 * 1000 * 60,
//   rpId: HOSTNAME,
//   rpName: 'FIDO2 Demo',
//   challengeSize: CHALLENGE_SIZE,
//   cryptoParams: [-7]
// })

// const app = express()

// app.use(morgan('tiny'))
// app.use(csrfCheck)

// app.get('/', (req, res) => {
//   res.status(200).send('ok')
// })

// app.post('registerRequest')

// let assetlinks: Array<unknown> | null = null
// app.get('/.well-known/assetlinks.json', wrap(async (req, res) => {
//   if (assetlinks !== null) {
//     res.json(assetlinks)
//     return
//   }
//   assetlinks = []
//   const relation = [
//     'delegate+permission/common.handle_all_urls',
//     'delegate_permission/common.get_login_creds'
//   ]

//   assetlinks.push({
//     relation,
//     target: {
//       namespace: 'web',
//       site: `https://${HOSTNAME}`
//     }
//   })

//   if (process.env.GCLOUD_PROJECT) {
//     assetlinks.push({
//       relation,
//       target: {
//         namespace: 'web',
//         site: `https://${process.env.GCLOUD_PROJECT}.web.app`
//       }
//     })
//   }

//   const pm = firebase.projectManagement()
//   const androidApps = await pm.listAndroidApps()
//   for (const app of androidApps) {
//     assetlinks.push({
//       relation,
//       target: {
//         namespace: 'android_app',
//         package_name: await app.getMetadata().then(res => res.packageName),
//         sha256_cert_fingerprints: await app.getShaCertificates()
//           .then(res => res
//             .filter(sha => sha.certType === 'sha256')
//             .map(sha => sha.shaHash))
//       }
//     })
//   }

//   res.json(assetlinks)
// }))

// export default app
