'use strict';

(function (window) {
  const Engine2D = {
    name: 'Option 1: Pure 2D Satellite Surveillance',

    applyToTimeline(timeline) {
      if (!timeline || !Array.isArray(timeline.views)) return timeline;

      timeline.views.forEach(v => {
        if (v.use3D) {
          v.use3D = false;
        }
      });
      return timeline;
    },

    enable() {
      console.log('[Engine2D] Activating Option 1: Pure 2D Satellite Surveillance');
      if (window.TIMELINE) {
        this.applyToTimeline(window.TIMELINE);
      }

      const threeCanvas = document.getElementById('three-canvas');
      if (threeCanvas) {
        threeCanvas.classList.remove('active');
        threeCanvas.style.display = 'none';
      }
      const mapEl = document.getElementById('map');
      if (mapEl) {
        mapEl.style.opacity = '1';
      }
      if (window.threeSceneManager) {
        window.threeSceneManager.hide();
      }
    }
  };

  window.setSwitchMode = function (mode = '3D') {
    const is3D = String(mode).toUpperCase() === '3D';
    if (!window.TIMELINE) return;

    window.TIMELINE.views.forEach(v => {
      if (v.id === 'view_1_street' || v.id === 'view_7_final' || v.isLanding) {
        v.use3D = is3D;
      }
    });

    if (is3D) {
      console.log('Switch mode set to: OPTION 3 (Overhauled 3D Scenes)');
      const threeCanvas = document.getElementById('three-canvas');
      if (threeCanvas) {
        threeCanvas.style.display = '';
      }
    } else {
      Engine2D.enable();
      console.log('Switch mode set to: OPTION 1 (Pure 2D Satellite Surveillance)');
    }
  };

  window.Engine2D = Engine2D;
})(window);
