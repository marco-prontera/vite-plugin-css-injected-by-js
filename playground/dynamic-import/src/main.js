import './base.css';

const app = document.querySelector('#app');
if (app) {
  app.textContent = 'Dynamic fixture loaded';
}

import('./dynamic.js').then(({ mountDynamic }) => {
  mountDynamic();
});
