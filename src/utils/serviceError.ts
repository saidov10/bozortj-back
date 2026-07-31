// Lightweight error that carries an HTTP-style status, so service functions can
// be reused by both Express controllers and the Telegram bot handlers.
export class ServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ServiceError';
  }
}
