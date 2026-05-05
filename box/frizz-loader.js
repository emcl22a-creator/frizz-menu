/**
 * ============================================
 * FRIZZ EMBED LOADER
 * ============================================
 *
 * Intégration en 1 ligne sur n'importe quel site :
 * <script src="https://frizz-instant.com/box/frizz-loader.js" data-center="ton-slug"></script>
 *
 * Avec options :
 * <script src="https://frizz-instant.com/box/frizz-loader.js"
 *   data-center="ton-slug"
 *   data-lang="fr"
 *   data-target="frizz-container">
 * </script>
 *
 * Ou impératif :
 * Frizz.embed({ center: 'ton-slug', target: '#frizz', lang: 'fr', height: 700 });
 */

(function() {
  'use strict';

  const FRIZZ_BASE_URL = 'https://frizz-instant.com/box';

  // Récupérer les paramètres du tag <script>
  const currentScript = document.currentScript ||
    (function() {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  function createFrizzWidget(options) {
    const center = options.center || (currentScript && currentScript.getAttribute('data-center'));
    const lang = options.lang || (currentScript && currentScript.getAttribute('data-lang')) || '';
    const targetSelector = options.target ||
      (currentScript && currentScript.getAttribute('data-target')) || null;
    const height = options.height || 760;
    const width = options.width || '100%';

    if (!center) {
      console.error('[Frizz] Missing data-center attribute. See https://frizz-instant.com/box/');
      return;
    }

    // Construire l'URL du widget embed
    let widgetUrl = FRIZZ_BASE_URL + '/embed.html?c=' + encodeURIComponent(center);
    if (lang) widgetUrl += '&lang=' + encodeURIComponent(lang);

    // Créer l'iframe
    const iframe = document.createElement('iframe');
    iframe.src = widgetUrl;
    iframe.style.cssText =
      'width: ' + (typeof width === 'number' ? width + 'px' : width) + '; ' +
      'height: ' + height + 'px; ' +
      'border: none; background: transparent; max-width: 580px; display: block; margin: 0 auto;';
    iframe.setAttribute('title', 'Frizz reservation widget');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');

    // Trouver l'élément cible OU créer un container après le <script>
    let target;
    if (targetSelector) {
      target = document.querySelector(
        targetSelector.charAt(0) === '#' || targetSelector.charAt(0) === '.'
          ? targetSelector
          : '#' + targetSelector
      );
    }

    if (target) {
      target.innerHTML = '';
      target.appendChild(iframe);
    } else if (currentScript && currentScript.parentNode) {
      currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
    } else {
      document.body.appendChild(iframe);
    }

    // Auto-resize via postMessage (optionnel, pour iframes responsive)
    window.addEventListener('message', function(event) {
      if (event.data && event.data.frizz === 'resize' && event.data.height) {
        iframe.style.height = event.data.height + 'px';
      }
    });

    return iframe;
  }

  // Exposer l'API
  window.Frizz = window.Frizz || {};
  window.Frizz.embed = createFrizzWidget;

  // Auto-init si data-center présent sur le script
  if (currentScript && currentScript.getAttribute('data-center')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        createFrizzWidget({});
      });
    } else {
      createFrizzWidget({});
    }
  }
})();
