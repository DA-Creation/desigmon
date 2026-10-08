/* Editable private source projects + RGBDS WASM compilation. No game content bundled. */
(function (root) {
  'use strict';
  const base = typeof document !== 'undefined' ? document.currentScript?.src || location.href : '';
  const url = p => new URL(p, base).href;
  const FORMAT = 'designmon-gold-build-project-v1';
  const referenceSHA = '9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6';
  let runtime;
  function script(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script'); tag.src = src;
      tag.onload = resolve; tag.onerror = () => reject(Error('빌드 도구를 열지 못했습니다. 저장소 폴더 전체가 필요합니다.'));
      document.head.appendChild(tag);
    });
  }
  function loadRuntime() {
    if (root.DesignmonSourceBuild && root.RGBASM && root.RGBLINK && root.RGBFIX && root.RGBGFX &&
        root.PG_GFX && root.PG_GBCPAL && root.PG_LZCOMPRESS && root.PG_PNG_DIMENSIONS) return Promise.resolve();
    if (!runtime) runtime = (async () => {
      if (typeof module !== 'undefined' && module.exports) {
        root.DesignmonSourceBuild = require('../../tools/gold-source/source-builder.js');
        for (const tool of ['rgbasm', 'rgblink', 'rgbfix', 'rgbgfx']) root[tool.toUpperCase()] = require('../vendor/rgbds/' + tool + '.js');
        for (const tool of ['gfx', 'gbcpal', 'lzcompress', 'png_dimensions']) root['PG_' + tool.toUpperCase()] = require('../../tools/gold-source/runtime/' + tool + '.js');
        return;
      }
      await script(url('../../tools/gold-source/source-builder.js'));
      for (const tool of ['rgbasm', 'rgblink', 'rgbfix', 'rgbgfx']) await script(url('../vendor/rgbds/' + tool + '.js'));
      for (const tool of ['gfx', 'gbcpal', 'lzcompress', 'png_dimensions']) await script(url('../../tools/gold-source/runtime/' + tool + '.js'));
    })().catch(error => {runtime = null; throw error;});
    return runtime;
  }
  function base64(bytes) {
    let result = ''; for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(result);
  }
  async function sha256(bytes) {
    const value = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(value)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  class SourceProject {
    constructor(project) {
      if (!project || project.format !== FORMAT || !project.files || !Array.isArray(project.assembly_units))
        throw Error('한국어 골드 소스 프로젝트 JSON이 아닙니다.');
      this.project = project;
      const saved = project.build_state?.pendingFiles;
      // Legacy exports did not preserve dirty graphics. Rebuild their PNGs once
      // rather than silently accepting stale generated 2bpp/LZ cache files.
      this.pending = new Set(Array.isArray(saved) ? saved.filter(path => Object.hasOwn(project.files, path)) :
        Object.keys(project.files).filter(path => path.endsWith('.png')));
      this.changed = new Set(this.pending);
      this.project.build_state = {pendingFiles: [...this.pending]};
      this.building = false;
    }
    static async import(input) {
      const text = typeof input === 'string' ? input : await input.text();
      if (text.length > 150 * 1024 * 1024) throw Error('프로젝트 파일이 너무 큽니다.');
      await loadRuntime();
      const project = JSON.parse(text); root.DesignmonSourceBuild.validate(project);
      return new SourceProject(project);
    }
    get metadata() {
      return {format: FORMAT, sourceCommit: this.project.source_commit, rgbdsVersion: this.project.rgbds_version,
        baseRomSHA256: this.project.base_rom_sha256, fileCount: Object.keys(this.project.files).length,
        changedFiles: [...this.changed], coverage: this.project.coverage};
    }
    list(query = '') {
      query = String(query).toLowerCase();
      return Object.entries(this.project.files).filter(([path]) => path.toLowerCase().includes(query))
        .map(([path, file]) => ({path, text: file.encoding === 'utf8', encoding: file.encoding,
          changed: this.changed.has(path), size: file.data.length})).sort((a, b) => a.path.localeCompare(b.path));
    }
    read(path) {
      const file = this.project.files[path]; if (!file) throw Error('파일이 없습니다.');
      return file.encoding === 'utf8' ? file.data : root.DesignmonSourceBuild.bytes(file);
    }
    write(path, value) {
      if (this.building) throw Error('빌드가 끝난 후 수정하세요.');
      const file = this.project.files[path]; if (!file) throw Error('파일이 없습니다.');
      if (file.encoding === 'utf8') {
        if (typeof value !== 'string') throw Error('텍스트가 필요합니다.');
        file.data = value;
      } else {
        if (!(value instanceof Uint8Array)) throw Error('바이너리 바이트가 필요합니다.');
        file.data = base64(value);
      }
      this.changed.add(path);
      this.pending.add(path);
      this.project.build_state = {pendingFiles: [...this.pending]};
    }
    export() {return JSON.stringify(this.project);}
    async build(options = {}) {
      if (this.building) throw Error('이미 빌드 중입니다.');
      this.building = true;
      try {
        let result;
        if (!root.GOLD_STANDALONE && typeof location !== 'undefined' &&
            (location.protocol === 'http:' || location.protocol === 'https:')) {
          result = await new Promise((resolve, reject) => {
            const worker = new Worker(url('source-build-worker.js'));
            const abort = () => {worker.terminate(); reject(Error('빌드를 취소했습니다.'));};
            options.signal?.addEventListener('abort', abort, {once: true});
            worker.onmessage = event => {
              const message = event.data;
              if (message.type === 'progress') options.onProgress?.(message.value);
              else {
                worker.terminate(); options.signal?.removeEventListener('abort', abort);
                if (message.type === 'result') resolve(message.value); else reject(Error(message.error));
              }
            };
            worker.onerror = event => {worker.terminate(); options.signal?.removeEventListener('abort', abort); reject(Error(event.message));};
            worker.postMessage({project: this.project, changedFiles: [...this.pending], rebuildGraphics: !!options.rebuildGraphics});
          });
        } else {
          await loadRuntime();
          result = await root.DesignmonSourceBuild.compile(this.project, {...options, changedFiles: [...this.pending]});
        }
        for (const [path, data] of Object.entries(result.graphicsOutputs || {}))
          this.project.files[path] = {encoding: 'base64', data: base64(data)};
        result.sha256 = await sha256(result.rom);
        result.identicalToOriginal = result.sha256 === referenceSHA;
        this.pending.clear();
        this.project.build_state = {pendingFiles: []};
        return result;
      } finally {this.building = false;}
    }
  }
  root.DesignmonSourceProject = SourceProject;
  if (typeof module !== 'undefined' && module.exports) module.exports = SourceProject;
})(globalThis);
