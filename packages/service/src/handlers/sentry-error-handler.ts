import { HttpHandler, HttpHandlerContext, HttpHandlerResponse } from '@digita-ai/handlersjs-http';

import * as Sentry from '@sentry/node';
import { Observable, catchError, throwError } from 'rxjs';

export class SentryErrorHandler implements HttpHandler {
  constructor(private nestedHandler: HttpHandler) {
    if (!nestedHandler) {
      throw new Error('A HttpHandler must be provided');
    }
  }

  handle(context: HttpHandlerContext): Observable<HttpHandlerResponse> {
    return this.nestedHandler.handle(context).pipe(
      catchError((error) => {
        Sentry.captureException(error);
        return throwError(() => error);
      })
    );
  }
}
