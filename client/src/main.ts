import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => document.getElementById('startup-status')?.remove())
  .catch((err) => {
    console.error(err);
    const status = document.getElementById('startup-status');
    if (status) {
      status.textContent =
        'Не удалось загрузить Dino LMS. Проверьте подключение к серверу. / Unable to load Dino LMS. Check the server connection. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Повторить / Retry';
      retry.onclick = () => location.reload();
      status.append(retry);
    }
  });
