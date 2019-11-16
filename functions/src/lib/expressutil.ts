import { Request, Response, NextFunction, RequestHandler } from 'express'

export interface PromiseRequestHandler {
    (req: Request, res: Response, next: NextFunction): Promise<any>
  }

export function wrap (fn: PromiseRequestHandler): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next)
}

export function csrfCheck (req: Request, res: Response, next: NextFunction) {
  if (req.header('X-Requested-With') !== 'XMLHttpRequest') {
    res.status(400).json({ error: 'invalid access.' })
    return
  }
  next()
}
