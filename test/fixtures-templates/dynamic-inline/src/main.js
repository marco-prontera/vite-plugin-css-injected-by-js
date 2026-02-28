import './base.css';

const app = document.querySelector('#app');
if (app) {
  app.textContent = 'Dynamic inline fixture loaded';
}

import('./dynamic.js').then(({ mountDynamic }) => {
  mountDynamic();
});
