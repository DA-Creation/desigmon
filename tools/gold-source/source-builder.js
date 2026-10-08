/* Local full-ROM ASM builds. RGBDS factories are MIT; game projects stay local. */
(function (root) {
  'use strict';
  const FORMAT = 'designmon-gold-build-project-v1';
  const utf8 = new TextEncoder();
  function bytes(record) {
    if (record.encoding === 'utf8') return utf8.encode(record.data);
    if (record.encoding === 'base64') {
      if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(record.data, 'base64'));
      return Uint8Array.from(atob(record.data), c => c.charCodeAt(0));
    }
    throw Error('Unsupported file encoding');
  }
  function safePath(value) {
    return typeof value === 'string' && value.length > 0 && !value.startsWith('/') &&
      !value.includes('\\') && value.split('/').every(v => v && v !== '.' && v !== '..');
  }
  function validate(project) {
    if (!project || project.format !== FORMAT || project.rgbds_version !== '1.0.3' ||
        !project.files || !Array.isArray(project.assembly_units)) throw Error('Invalid source project');
    const entries = Object.entries(project.files);
    if (entries.length > 20000 || project.assembly_units.length > 128) throw Error('Project too large');
    let total = 0;
    for (const [path, record] of entries) {
      if (!safePath(path) || !record || typeof record.data !== 'string') throw Error('Invalid source file');
      total += record.data.length;
      if (total > 150 * 1024 * 1024) throw Error('Project exceeds the 150 MiB text limit');
      if (!['utf8', 'base64'].includes(record.encoding)) throw Error('Invalid source encoding');
    }
    for (const unit of project.assembly_units) {
      if (!safePath(unit.source) || !safePath(unit.object) || !project.files[unit.source]) throw Error('Invalid assembly unit');
    }
    for (const path of ['includes.asm', 'layout.link', 'opaque.asm']) {
      if (!project.files[path]) throw Error('Incomplete source project: ' + path);
    }
    if (project.graphics_steps) {
      if (!Array.isArray(project.graphics_steps) || project.graphics_steps.length > 15000) throw Error('Invalid graphics build plan');
      for (const step of project.graphics_steps) {
        if (!['rgbgfx','gfx','gbcpal','lzcompress','png_dimensions','cp','cat','tr'].includes(step.tool) ||
            !Array.isArray(step.argv) || !Array.isArray(step.inputs) || !safePath(step.output) ||
            !step.inputs.every(safePath) || !step.argv.every(v => typeof v === 'string')) throw Error('Invalid graphics step');
      }
    }
    return project;
  }
  async function compile(project, options = {}) {
    validate(project);
    const factories = options.factories || {rgbasm: root.RGBASM, rgblink: root.RGBLINK, rgbfix: root.RGBFIX, rgbgfx: root.RGBGFX,
      gfx: root.PG_GFX, gbcpal: root.PG_GBCPAL, lzcompress: root.PG_LZCOMPRESS, png_dimensions: root.PG_PNG_DIMENSIONS};
    const files = new Map(Object.entries(project.files).map(([path, data]) => [path, bytes(data)]));
    const logs = [];
    let completed = 0;
    const dirty = new Set(options.changedFiles || []);
    const graphicSteps = [];
    for (const step of project.graphics_steps || []) {
      if (options.rebuildGraphics || step.inputs.some(path => dirty.has(path))) {
        graphicSteps.push(step); dirty.add(step.output);
      }
    }
    const total = project.assembly_units.length + 4 + graphicSteps.length;
    async function invoke(tool, argv, outputPaths, inputs) {
      if (options.signal?.aborted) throw Error('Build cancelled');
      if (typeof factories[tool] !== 'function') throw Error('Missing RGBDS factory: ' + tool);
      const messages = [];
      const settings = {noInitialRun: true, print: s => messages.push(s), printErr: s => messages.push(s)};
      if (files.has('.tools/' + tool + '.wasm')) settings.wasmBinary = files.get('.tools/' + tool + '.wasm');
      const module = await factories[tool](settings);
      const mount = inputs ? inputs.map(path => [path, files.get(path)]) : files;
      for (const [path, data] of mount) {
        if (!data) throw Error('Missing build input: ' + path);
        module.FS.mkdirTree('/work/' + path.split('/').slice(0, -1).join('/'));
        module.FS.writeFile('/work/' + path, data);
      }
      for (const path of outputPaths) module.FS.mkdirTree('/work/' + path.split('/').slice(0, -1).join('/'));
      module.FS.chdir('/work');
      // Emscripten callMain prepends argv[0] in place. Keep the saved build plan immutable.
      const code = module.callMain([...argv]);
      logs.push({tool, argv, code, messages});
      if (code !== 0) throw Error(tool + ' failed (' + code + ')\n' + messages.join('\n'));
      for (const path of outputPaths) files.set(path, new Uint8Array(module.FS.readFile('/work/' + path)));
      options.onProgress?.({completed: ++completed, total, tool, file: outputPaths[0]});
      // Permit cancellation/painting between whole translation units. A Worker is recommended.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const graphicsOutputs = {};
    for (const step of graphicSteps) {
      if (['cp', 'cat', 'tr'].includes(step.tool)) {
        const argv = step.argv;
        let data;
        if (step.tool === 'cp') data = new Uint8Array(files.get(argv[argv.length - 2]));
        if (step.tool === 'tr') data = files.get(argv[argv.indexOf('<') + 1]).filter(v => v !== 0);
        if (step.tool === 'cat') {
          const sources = argv.slice(0, argv.indexOf('>')).map(path => files.get(path));
          if (sources.some(v => !v)) throw Error('Missing concatenation input');
          data = new Uint8Array(sources.reduce((sum, value) => sum + value.length, 0));
          let offset = 0; for (const value of sources) {data.set(value, offset); offset += value.length;}
        }
        files.set(step.output, data);
        options.onProgress?.({completed: ++completed, total, tool: step.tool, file: step.output});
      } else await invoke(step.tool, step.argv, [step.output], step.inputs);
      graphicsOutputs[step.output] = new Uint8Array(files.get(step.output));
    }
    const objects = [];
    for (const unit of project.assembly_units) {
      await invoke('rgbasm', ['-Q8', '-P', 'includes.asm', '-D', '_GOLD', '-o', unit.object, unit.source], [unit.object]);
      objects.push(unit.object);
    }
    await invoke('rgbasm', ['-o', 'opaque.o', 'opaque.asm'], ['opaque.o']);
    // The backdrop is rebuilt from the editable opaque ASM, never copied from a
    // bundled ROM. Keeping it separate lets resized graphics consume padding,
    // matching the pinned upstream's overlay placement behavior.
    await invoke('rgblink', ['-o', 'backdrop.gbc', 'opaque.o'], ['backdrop.gbc']);
    await invoke('rgblink', ['-l', 'layout.link', '-n', 'result.sym', '-m', 'result.map', '-O', 'backdrop.gbc', '-o', 'result.gbc', ...objects],
      ['result.gbc', 'result.sym', 'result.map']);
    await invoke('rgbfix', ['-Cjv', '-k', '01', '-l', '0x33', '-m', 'MBC3+TIMER+RAM+BATTERY', '-r', '3', '-p', '0',
      '-t', 'POKEMON_GLD', '-i', 'AAUK', 'result.gbc'], ['result.gbc']);
    const rom = files.get('result.gbc');
    if (rom.length !== 2097152) throw Error('Unexpected compiled ROM size');
    return {rom, symbols: new TextDecoder().decode(files.get('result.sym')),
      map: new TextDecoder().decode(files.get('result.map')), logs, graphicsOutputs};
  }
  const api = {validate, compile, bytes, FORMAT};
  root.DesignmonSourceBuild = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
