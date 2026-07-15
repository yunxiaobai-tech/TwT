// 音频编解码器
// 2025-11-02
(function (Scratch) {
  'use strict';
  if (!(Scratch && Scratch.extensions && Scratch.extensions.register)) {
    console.warn('[音频编码器] 未检测到扩展注册环境，请在兼容编辑器中加载。'); 
    return;
  }

  const A = Scratch.ArgumentType;
  const B = Scratch.BlockType;
  const Cast = Scratch.Cast || { toString: String, toNumber: Number, toBoolean: x => !!x };

  // ========== 图标 ==========
  function _iconData() {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
      + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0%" stop-color="#12B886"/><stop offset="100%" stop-color="#0CA678"/>'
      + '</linearGradient></defs>'
      + '<rect x="4" y="4" width="32" height="32" rx="8" fill="url(#g)"/>'
      + '<g fill="#fff"><rect x="10" y="12" width="4" height="16" rx="2"/>'
      + '<rect x="18" y="8" width="4" height="24" rx="2"/>'
      + '<rect x="26" y="14" width="4" height="12" rx="2"/></g></svg>';
    try {
      const b64 = (typeof btoa === 'function')
        ? btoa(unescape(encodeURIComponent(svg)))
        : Buffer.from(svg, 'utf8').toString('base64');
      return 'data:image/svg+xml;base64,' + b64;
    } catch {
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }
  }
  const ICON = _iconData();

  // ========== 工具 ==========
  const clamp = (x, a, b) => (x < a ? a : (x > b ? b : x));
  const db2amp = (db) => Math.pow(10, db / 20);

  // 线性重采样（单声道 Float32）
  function resampleLinear(input, inRate, outRate) {
    if (inRate === outRate) return input;
    const ratio = inRate / outRate;
    const outLen = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(outLen);
    for (let n = 0; n < outLen; n++) {
      const t = n * ratio;
      const i = Math.floor(t);
      const frac = t - i;
      const a = input[i] || 0;
      const b = input[i + 1] || a;
      out[n] = a + (b - a) * frac;
    }
    return out;
  }

  // TPDF 抖动（±1 LSB 尺度）
  function _tpdf(lsb) { return (Math.random() + Math.random() - 1) * lsb; }

  // 编码：Float32 [-1,1] → (Uint8/Int16/Uint32位模式)
  function encodePCM(float32, mode) {
    const len = float32.length;
    if (mode === 'PCM8') {
      const out = new Uint8Array(len);
      const lsb = 1 / 127.5;
      for (let i = 0; i < len; i++) {
        const v = clamp(float32[i] + _tpdf(lsb), -1, 1);
        out[i] = Math.round((v + 1) * 127.5); // 0..255
      }
      return out;
    }
    if (mode === 'PCM16') {
      const out = new Int16Array(len);
      const lsb = 1 / 32768;
      for (let i = 0; i < len; i++) {
        const v = clamp(float32[i] + _tpdf(lsb), -1, 1);
        out[i] = Math.round(v * 32767); // -32768..32767
      }
      return out;
    }
    // F32：位级无损
    const u32 = new Uint32Array(len);
    const dv = new DataView(new ArrayBuffer(4));
    for (let i = 0; i < len; i++) {
      dv.setFloat32(0, float32[i], true);
      u32[i] = dv.getUint32(0, true);
    }
    return u32;
  }

  // 解码：数字→Float32
  function decodePCM(nums, mode) {
    const len = nums.length;
    const out = new Float32Array(len);
    if (mode === 'PCM8') {
      for (let i = 0; i < len; i++) {
        const n = clamp(Number(nums[i]) || 0, 0, 255);
        out[i] = (n / 255) * 2 - 1;
      }
      return out;
    }
    if (mode === 'PCM16') {
      for (let i = 0; i < len; i++) {
        const n = Number(nums[i]) || 0;
        out[i] = clamp(n / 32768, -1, 1);
      }
      return out;
    }
    const dv = new DataView(new ArrayBuffer(4));
    for (let i = 0; i < len; i++) {
      const n = Number(nums[i]) || 0;
      dv.setUint32(0, (n >>> 0), true);
      out[i] = dv.getFloat32(0, true);
    }
    return out;
  }

  class AudioCodecPro {
    constructor() {
      // 配置
      this._mode = 'PCM16';
      this._delimiter = ';';
      this._targetRate = 16000;

      // 录音状态/节点
      this._ac = null;
      this._deviceRate = 0;
      this._stream = null;
      this._src = null;
      this._hp = null;       // DC 高通
      this._notch = null;    // 工频陷波
      this._lp1 = null;      // 低通1
      this._lp2 = null;      // 低通2（可选）
      this._proc = null;
      this._mute = null;
      this._chunks = [];
      this._isRecording = false;

      // 噪声门状态
      this._nsLevel = '中度';   // 无/轻度/中度/重度
      this._humMode = '关闭';   // 关闭/50Hz/60Hz
      this._nsState = null;

      // 数据/播放
      this._encoded = '';
      this._lastEncodeRate = 0;
      this._isPlaying = false;
      this._playSrc = null;

      // 错误
      this._lastErr = '';

      try { window.addEventListener('beforeunload', () => this._cleanupAll()); } catch {}
    }

    getInfo() {
      return {
        id: 'audioCodecPro',
        name: '音频编码器',
        color1: '#12B886',
        color2: '#0CA678',
        color3: '#099268',
        blockIconURI: ICON, menuIconURI: ICON, iconURL: ICON,
        docsURI: 'https://turbowarp.org/',
        blocks: [
          // 环境/状态
          { opcode: 'envPing', blockType: B.REPORTER, text: '环境检测' },

          // 编码
          { opcode: 'startRec', blockType: B.COMMAND, text: '开始录音' },
          { opcode: 'stopRec', blockType: B.COMMAND, text: '停止录音并生成数字' },
          { opcode: 'isRec', blockType: B.BOOLEAN, text: '录音中？' },
          { opcode: 'encoded', blockType: B.REPORTER, text: '编码结果' },
          { opcode: 'clearEncoded', blockType: B.COMMAND, text: '清空编码结果' },

          // 设置
          { opcode: 'setMode', blockType: B.COMMAND, text: '设置精度 [M]', arguments: { M: { type: A.STRING, menu: 'modes', defaultValue: 'PCM16' } } },
          { opcode: 'setDelimiter', blockType: B.COMMAND, text: '设置分隔符 [D]', arguments: { D: { type: A.STRING, defaultValue: ';' } } },
          { opcode: 'setRate', blockType: B.COMMAND, text: '设置采样率 [R] Hz (0=设备)', arguments: { R: { type: A.NUMBER, defaultValue: 16000 } } },
          { opcode: 'deviceRate', blockType: B.REPORTER, text: '设备采样率' },
          { opcode: 'lastEncodeRate', blockType: B.REPORTER, text: '上次编码采样率' },

          // 新增：降噪与工频
          { opcode: 'setNSLevel', blockType: B.COMMAND, text: '设置降噪等级 [L]', arguments: { L: { type: A.STRING, menu: 'nsLevels', defaultValue: '中度' } } },
          { opcode: 'setHumMode', blockType: B.COMMAND, text: '设置工频陷波 [H]', arguments: { H: { type: A.STRING, menu: 'humModes', defaultValue: '关闭' } } },

          // 解码/播放
          { opcode: 'decodePlay', blockType: B.COMMAND, text: '解码并播放 [S]', arguments: { S: { type: A.STRING, defaultValue: '把数字字符串粘贴到这里' } } },
          { opcode: 'stopPlay', blockType: B.COMMAND, text: '停止播放' },
          { opcode: 'isPlaying', blockType: B.BOOLEAN, text: '正在播放？' },

          // 错误
          { opcode: 'lastError', blockType: B.REPORTER, text: '错误信息' },
        ],
        menus: {
          modes: { acceptReporters: true, items: ['PCM8', 'PCM16', 'F32'] },
          nsLevels: { acceptReporters: true, items: ['无', '轻度', '中度', '重度'] },
          humModes: { acceptReporters: true, items: ['关闭', '50Hz', '60Hz'] },
        }
      };
    }

    // ===== AudioContext =====
    async _ensureAC() {
      if (!this._ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        try { this._ac = new AC(); }
        catch (e) { this._lastErr = '创建 AudioContext 失败：' + (e?.message || e); return null; }
      }
      if (this._ac.state === 'suspended') { try { await this._ac.resume(); } catch {} }
      this._deviceRate = this._ac.sampleRate | 0;
      return this._ac;
    }

    envPing() {
      const secure = (location.protocol === 'https:') || (location.hostname === 'localhost');
      const hasAC = !!(window.AudioContext || window.webkitAudioContext);
      const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      const hasReg = !!(Scratch && Scratch.extensions && Scratch.extensions.register);
      return (hasReg ? 'OK' : 'NO') + ' | secure:' + (secure ? 1 : 0) + ' | AC:' + (hasAC ? 1 : 0) + ' | micAPI:' + (hasMedia ? 1 : 0);
    }

    // ===== 设置 =====
    setMode(args) {
      const m = Cast.toString(args.M || 'PCM16').toUpperCase();
      if (m === 'PCM8' || m === 'PCM16' || m === 'F32') this._mode = m;
    }
    setDelimiter(args) { this._delimiter = Cast.toString(args.D || ';'); }
    setRate(args) {
      let r = Cast.toNumber(args.R);
      if (!(r >= 0)) r = 0;
      this._targetRate = Math.round(r);
    }
    setNSLevel(args) {
      const L = Cast.toString(args.L || '中度');
      if (['无','轻度','中度','重度'].includes(L)) this._nsLevel = L;
    }
    setHumMode(args) {
      const H = Cast.toString(args.H || '关闭');
      if (['关闭','50Hz','60Hz'].includes(H)) this._humMode = H;
    }
    deviceRate() { return String(this._deviceRate || (this._ac ? (this._ac.sampleRate | 0) : 0)); }
    lastEncodeRate() { return String(this._lastEncodeRate || 0); }

    // ===== 录音 =====
    async startRec() {
      if (this._isRecording) return;
      this._lastErr = '';
      this._encoded = '';
      this._chunks = [];

      const secure = (location.protocol === 'https:') || (location.hostname === 'localhost');
      if (!secure) { this._lastErr = '需要 https 或 localhost 才能访问麦克风'; return; }

      const ac = await this._ensureAC();
      if (!ac) return;

      const inRate = this._deviceRate || (this._ac ? (this._ac.sampleRate | 0) : 44100);
      let tgtRate = (this._targetRate | 0) || inRate;
      if (this._mode === 'F32') tgtRate = inRate; // F32 保持位级无损，不重采样

      // 根据降噪等级调整低通强度（更强 → 截止更低）
      const nsIdx = { '无':0, '轻度':1, '中度':2, '重度':3 }[this._nsLevel] || 0;
      const lpFrac = clamp(0.70 - nsIdx * 0.10, 0.40, 0.80); // 0.70/0.60/0.50/0.40 * Nyquist
      const nyqBase = ((this._mode === 'F32') ? inRate : tgtRate) * 0.5;
      const lpCut = Math.min(nyqBase * lpFrac, 20000);

      try {
        this._stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (e) {
        this._lastErr = '麦克风授权失败：' + (e?.message || e);
        return;
      }

      try {
        this._src = ac.createMediaStreamSource(this._stream);

        // DC 高通（20~30Hz）
        this._hp = ac.createBiquadFilter();
        this._hp.type = 'highpass';
        this._hp.frequency.value = 25;

        // 工频陷波（可选）
        if (this._humMode !== '关闭') {
          this._notch = ac.createBiquadFilter();
          this._notch.type = 'notch';
          this._notch.frequency.value = (this._humMode === '50Hz') ? 50 : 60;
          this._notch.Q.value = 30; // 窄带
        } else {
          this._notch = null;
        }

        // 双级低通（抗混叠 + 平滑高频噪声）
        this._lp1 = ac.createBiquadFilter();
        this._lp1.type = 'lowpass';
        this._lp1.frequency.value = lpCut;

        this._lp2 = ac.createBiquadFilter();
        this._lp2.type = 'lowpass';
        this._lp2.frequency.value = lpCut;

        // ScriptProcessor：读取处理后数据（保持最大兼容）
        const bufSize = 4096;
        if (!ac.createScriptProcessor) {
          this._lastErr = '浏览器不支持 ScriptProcessor，请用 Chrome/Edge 或 TurboWarp 桌面版';
          this._cleanupInput();
          return;
        }
        this._proc = ac.createScriptProcessor(bufSize, 1, 1);

        // 噪声门状态初始化
        this._nsState = this._makeNSState(inRate, this._nsLevel);

        this._proc.onaudioprocess = (ev) => {
          if (!this._isRecording) return;
          const inbuf = ev.inputBuffer.getChannelData(0);
          const outbuf = ev.outputBuffer.getChannelData(0); // 虽然有静音旁路，仍写入 0，防止意外直通
          outbuf.fill(0);

          let processed;
          if (this._nsState.enable) {
            processed = this._nsProcessBlock(inbuf, this._nsState);
          } else {
            // 无降噪：复制
            processed = new Float32Array(inbuf);
          }
          this._chunks.push(processed);
        };

        // 静音旁路（避免直通到底）
        this._mute = ac.createGain();
        this._mute.gain.value = 0;

        // 连接：src -> HP -> (Notch?) -> LP1 -> LP2 -> Proc -> mute -> dest
        this._src.connect(this._hp);
        if (this._notch) this._hp.connect(this._notch), this._notch.connect(this._lp1);
        else this._hp.connect(this._lp1);
        this._lp1.connect(this._lp2);
        this._lp2.connect(this._proc);
        this._proc.connect(this._mute);
        this._mute.connect(ac.destination);

        this._isRecording = true;
      } catch (e) {
        this._lastErr = '构建录音节点失败：' + (e?.message || e);
        this._cleanupInput();
      }
    }

    async stopRec() {
      if (!this._isRecording) return;
      this._isRecording = false;
      this._cleanupInput();

      // 合并块
      let total = 0;
      for (const c of this._chunks) total += c.length;
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of this._chunks) { merged.set(c, off); off += c.length; }
      this._chunks = [];

      const inRate = this._deviceRate || (this._ac ? (this._ac.sampleRate | 0) : 44100);
      let target = (this._targetRate | 0) || inRate;
      if (this._mode === 'F32' && target !== inRate) target = inRate;

      const resampled = (target === inRate) ? merged : resampleLinear(merged, inRate, target);

      // 编码为数字字符串
      const typed = encodePCM(resampled, this._mode);
      const delim = this._delimiter;
      const CH = 6000;
      let out = '';
      const tmp = [];
      for (let i = 0; i < typed.length; i += CH) {
        const slice = typed.subarray(i, i + CH);
        tmp.length = slice.length;
        for (let k = 0; k < slice.length; k++) tmp[k] = String(slice[k]);
        out += tmp.join(delim) + delim;
      }
      if (out.endsWith(delim)) out = out.slice(0, -delim.length);

      this._encoded = out;
      this._lastEncodeRate = target;
    }

    _cleanupInput() {
      try { if (this._proc) { this._proc.disconnect(); this._proc.onaudioprocess = null; } } catch {}
      try { if (this._lp2) this._lp2.disconnect(); } catch {}
      try { if (this._lp1) this._lp1.disconnect(); } catch {}
      try { if (this._notch) this._notch.disconnect(); } catch {}
      try { if (this._hp) this._hp.disconnect(); } catch {}
      try { if (this._src) this._src.disconnect(); } catch {}
      try { if (this._mute) this._mute.disconnect(); } catch {}
      try { if (this._stream) this._stream.getTracks().forEach(t => t.stop()); } catch {}
      this._proc = this._lp1 = this._lp2 = this._notch = this._hp = this._src = this._mute = this._stream = null;
      this._nsState = null;
    }

    isRec() { return this._isRecording; }
    encoded() { return this._encoded || ''; }
    clearEncoded() { this._encoded = ''; }

    // ===== 噪声门实现 =====
    _makeNSState(sr, level) {
      if (level === '无') return { enable: false };
      // 参数表（更强 → 阈值更高、比率更大、释放更慢）
      const table = {
        '轻度': { thrDb: -55, ratio: 1.5, rmsMs: 20, atkMs: 8, relMs: 80, floorMul: 2.0 },
        '中度': { thrDb: -52, ratio: 2.5, rmsMs: 18, atkMs: 6, relMs: 120, floorMul: 2.5 },
        '重度': { thrDb: -48, ratio: 4.0, rmsMs: 16, atkMs: 4, relMs: 180, floorMul: 3.0 },
      };
      const cfg = table[level] || table['中度'];

      const rmsAlpha = Math.exp(-1 / Math.max(1, (sr * cfg.rmsMs / 1000)));
      const atkA = Math.exp(-1 / Math.max(1, (sr * cfg.atkMs / 1000)));
      const relA = Math.exp(-1 / Math.max(1, (sr * cfg.relMs / 1000)));

      return {
        enable: true,
        sr,
        thrAmp: db2amp(cfg.thrDb),
        ratio: cfg.ratio,
        rmsA: rmsAlpha,
        atkA, relA,
        floorMul: cfg.floorMul,
        // 状态
        env: 0,
        floor: 0.0005,   // 初始噪声地板（~ -66dB）
        gain: 1
      };
    }

    _nsProcessBlock(input, st) {
      const out = new Float32Array(input.length);
      const { rmsA, atkA, relA, thrAmp, ratio, floorMul } = st;
      let env = st.env, floor = st.floor, gain = st.gain;

      for (let i = 0; i < input.length; i++) {
        const x = input[i] || 0;
        // RMS 指数平滑
        const e2 = x * x;
        env = Math.sqrt(rmsA * (env * env) + (1 - rmsA) * e2);

        // 噪声地板慢速跟随（只在很安静时更新）
        if (env < thrAmp * 1.2) {
          floor = 0.999 * floor + 0.001 * env;
        }
        const dynThr = Math.max(thrAmp, floor * floorMul);

        // 期望增益（扩展 / 噪声门）
        let desired = 1;
        if (env < dynThr && dynThr > 0) {
          const r = env / dynThr;           // 0..1
          const p = Math.max(1, ratio);     // 比率
          desired = Math.pow(r, p - 1);     // r^(ratio-1), env→0 则更低
          desired = clamp(desired, 0, 1);
        }

        // 攻击/释放平滑
        const a = (desired < gain) ? atkA : relA;
        gain = a * gain + (1 - a) * desired;

        out[i] = x * gain;
      }

      st.env = env; st.floor = floor; st.gain = gain;
      return out;
    }

    // ===== 解码/播放 =====
    async decodePlay(args) {
      const s = Cast.toString(args.S || '').trim();
      if (!s) return;
      const ac = await this._ensureAC();
      if (!ac) return;

      const parts = s.split(this._delimiter).filter(t => t.length > 0);
      const f32 = decodePCM(parts, this._mode);

      const rate = (this._lastEncodeRate | 0) || (this._targetRate | 0) || (this._deviceRate | 0) || 44100;

      // 8ms 淡入/淡出
      const fade = Math.min(Math.floor(rate * 0.008), Math.floor(f32.length / 8));
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        f32[i] *= k;
        f32[f32.length - 1 - i] *= k;
      }

      this.stopPlay();
      try {
        const buf = ac.createBuffer(1, f32.length, rate);
        buf.copyToChannel(f32, 0, 0);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(ac.destination);
        src.onended = () => { this._isPlaying = false; this._playSrc = null; };
        src.start();
        this._playSrc = src; this._isPlaying = true; this._lastErr = '';
      } catch (e) {
        this._lastErr = '解码/播放失败：' + (e?.message || e);
        this._isPlaying = false; this._playSrc = null;
      }
    }

    stopPlay() {
      try { if (this._playSrc) { this._playSrc.stop(); this._playSrc.disconnect(); } } catch {}
      this._playSrc = null; this._isPlaying = false;
    }
    isPlaying() { return this._isPlaying; }

    // ===== 错误/收尾 =====
    lastError() { return this._lastErr || ''; }
    _cleanupAll() { try { this.stopPlay(); } catch {} try { this._cleanupInput(); } catch {} }
  }

  Scratch.extensions.register(new AudioCodecPro());
})(Scratch);