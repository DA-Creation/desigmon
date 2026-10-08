'use strict';
importScripts('../../tools/gold-source/source-builder.js', '../vendor/rgbds/rgbasm.js',
  '../vendor/rgbds/rgblink.js', '../vendor/rgbds/rgbfix.js', '../vendor/rgbds/rgbgfx.js',
  '../../tools/gold-source/runtime/gfx.js', '../../tools/gold-source/runtime/gbcpal.js',
  '../../tools/gold-source/runtime/lzcompress.js', '../../tools/gold-source/runtime/png_dimensions.js');
self.onmessage = async event => {
  try {
    const result = await DesignmonSourceBuild.compile(event.data.project, {
      onProgress: value => self.postMessage({type: 'progress', value}),
      changedFiles: event.data.changedFiles || [], rebuildGraphics: !!event.data.rebuildGraphics
    });
    self.postMessage({type: 'result', value: result}, [result.rom.buffer]);
  } catch (error) {self.postMessage({type: 'error', error: error.message || String(error)});}
};
