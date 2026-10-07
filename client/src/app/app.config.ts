import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { StartupService } from './core/startup.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => inject(StartupService).initialize()),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
  ],
};
