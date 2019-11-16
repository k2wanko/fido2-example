/* eslint-disable no-useless-constructor */
import * as firebase from 'firebase-admin'

export type ChallengeType = 'registration' | 'authentication'

export class Challenge {
  constructor (public type: ChallengeType, public challenge: string) {

  }

  static toFirestore (data: Challenge): firebase.firestore.DocumentData {
    return {
      type: data.type,
      challenge: data.challenge
    }
  }

  static fromFirestore (
    data: firebase.firestore.DocumentData
  ): Challenge {
    return new Challenge(data.type, data.challenge)
  }
}

export class Credential {
  constructor (
    public publicKey: string,
    public aaguid: string,
    public prevCounter: number
  ) {

  }
}
