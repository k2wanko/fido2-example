
export type EncodeMode = 'standard' | 'urlsafe'

export const unsupportModeError = (mode: string) => new Error(`Unsupport encode mode = ${mode}`)

export function encode (data: string | Buffer, mode: EncodeMode = 'standard'): string {
  let buf: Buffer
  if (data instanceof Buffer) {
    buf = data
  } else {
    buf = Buffer.from(data)
  }
  const res = buf.toString('base64')
  switch (mode) {
    case 'standard':
      return res
    case 'urlsafe':
      return res.replace('+', '-').replace('/', '_').replace(/=+$/, '')
    default:
      throw unsupportModeError(mode)
  }
}

export function decode (str: string, mode: EncodeMode = 'standard'): string {
  return toBuffer(str, mode).toString('utf8')
}

export function toBuffer (str: string, mode: EncodeMode = 'standard'): Buffer {
  switch (mode) {
    case 'standard':
      break
    case 'urlsafe':
      str.replace('-', '+').replace('_', '/')
      while (str.length % 4) { str += '=' }
      break
    default:
      throw unsupportModeError(mode)
  }
  return Buffer.from(str, 'base64')
}

export default {
  encode,
  decode,
  toBuffer
}
