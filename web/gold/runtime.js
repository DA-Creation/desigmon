(function(root){'use strict';
const keys={right:0,left:1,up:2,down:3,A:4,B:5,select:6,start:7};
const modes=[null,'link','infrared','both'];
class Runtime{
 constructor(module,boot,slot=0,shared=null){this.m=module;this.boot=boot;this.slot=slot;this.shared=shared||{devices:[]};this.shared.devices[slot]=this;}
 static async create(){let factory=root.SameBoyCore,boot=root.SAMEBOY_BOOT;if(typeof module!=='undefined'){factory=require('../vendor/sameboy.js');require('../vendor/sameboy-boot.js');boot=globalThis.SAMEBOY_BOOT;}return new Runtime(await factory(),Uint8Array.from(atob(boot),x=>x.charCodeAt(0)));}
 device(slot){if(slot!==0&&slot!==1)throw Error('기기는 0 또는 1입니다.');return this.shared.devices[slot]||(new Runtime(this.m,this.boot,slot,this.shared));}
 get loaded(){return !!this.m._gold_loaded_device(this.slot);}
 get frameNumber(){return this.m._gold_frames_device(this.slot);}
 set frameNumber(n){if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)throw Error('프레임 번호 오류');this.m._gold_set_frames_device(this.slot,n);}
 get connection(){return modes[this.m._gold_connection()];}
 get ticks(){return this.m._gold_ticks_device(this.slot);}
 requireLoaded(){if(!this.loaded)throw Error('ROM이 없습니다.');}
 withBytes(data,fn){if(!ArrayBuffer.isView(data)||data.BYTES_PER_ELEMENT!==1)throw TypeError('바이트 배열이 필요합니다.');const p=this.m._malloc(data.length||1);try{this.m.HEAPU8.set(data,p);return fn(p);}finally{this.m._free(p);}}
 open(data,{sampleRate=48000,deterministic=false}={}){this.withBytes(data,r=>this.withBytes(this.boot,b=>{if(this.m._gold_open_device(this.slot,r,data.length,b,this.boot.length,sampleRate,deterministic)!==0)throw Error('실행 엔진 초기화 실패');}));}
 frameResult(){const n=this.m._gold_audio_size_device(this.slot);return {pixels:this.pixels(),audio:new Int16Array(this.m.HEAPU8.buffer,this.m._gold_audio_device(this.slot),n*2).slice(),frameNumber:this.frameNumber};}
 frame(){this.requireLoaded();const linked=!!this.connection,n=linked?this.m._gold_pair_frame():this.m._gold_frame_device(this.slot);if(n<0)throw Error('실행 엔진 프레임 오류');const result=this.frameResult();if(linked)result.peer=this.device(1-this.slot).frameResult();return result;}
 // Diagnostic stepping for serial protocols. GB_run reports normalized 8MHz ticks.
 runLinkedTicks(ticks){if(!Number.isInteger(ticks)||ticks<0||ticks>140448)throw Error('통신 실행 주기 오류');if(!this.connection||this.m._gold_pair_ticks(ticks)<0)throw Error('두 기기를 연결해야 합니다.');const result=this.frameResult();result.peer=this.device(1-this.slot).frameResult();return result;}
 connect(mode='link'){const code=modes.indexOf(mode);if(code<=0)throw Error('통신 방식 오류');if(this.m._gold_connect(code)!==0)throw Error('두 기기의 ROM을 먼저 실행하세요.');return this;}
 disconnect(){this.m._gold_disconnect();return this;}
 pixels(){const p=this.m._gold_pixels_device(this.slot);return this.m.HEAPU8.slice(p,p+160*144*4);}
 key(name,down){if(!(name in keys))throw Error('Unknown key');if(this.loaded)this.m._gold_key_device(this.slot,keys[name],!!down);}
 release(){for(const k in keys)this.key(k,false);}
 state(){this.requireLoaded();return this.readBuffer(this.m._gold_state_size_device(this.slot),p=>this.m._gold_state_write_device(this.slot,p));}
 battery(){this.requireLoaded();const n=this.m._gold_battery_size_device(this.slot);return this.readBuffer(n,p=>{if(this.m._gold_battery_write_device(this.slot,p,n)!==0)throw Error('세이브 내보내기 실패');});}
 readBuffer(n,writer){const p=this.m._malloc(n||1);try{writer(p);return this.m.HEAPU8.slice(p,p+n);}finally{this.m._free(p);}}
 restore(data){this.requireLoaded();if(this.connection)throw Error('연결 중에는 두 기기 상태를 함께 복원하세요.');const backup=this.state();try{this.withBytes(data,p=>{if(this.m._gold_state_read_device(this.slot,p,data.length)!==0)throw Error('상태 파일 형식 오류');});}catch(e){this.withBytes(backup,p=>this.m._gold_state_read_device(this.slot,p,backup.length));throw e;}this.release();}
 loadBattery(data){this.requireLoaded();if(this.connection)throw Error('통신을 해제한 뒤 세이브를 불러오세요.');if(data.length!==32768&&data.length!==this.m._gold_battery_size_device(this.slot))throw Error('세이브 크기가 올바르지 않습니다.');this.withBytes(data,p=>this.m._gold_battery_read_device(this.slot,p,data.length));}
 pairState(){const n=this.m._gold_pair_state_size();if(!n)throw Error('두 기기의 ROM을 먼저 실행하세요.');return this.readBuffer(n,p=>{if(this.m._gold_pair_state_write(p,n)!==0)throw Error('통신 상태 내보내기 실패');});}
 restorePairState(data){this.withBytes(data,p=>{if(this.m._gold_pair_state_read(p,data.length)!==0)throw Error('통신 상태 파일 형식 오류');});this.device(0).release();this.device(1).release();}
 read(address){return this.m._gold_read_device(this.slot,address);}
 write(address,value){this.m._gold_write_device(this.slot,address,value);}
 get pc(){return this.m._gold_pc_device(this.slot);}
 close(){this.m._gold_close_device(this.slot);}
 closeAll(){this.device(0).close();this.device(1).close();}
}
root.GoldRuntime=Runtime;if(typeof module!=='undefined')module.exports=Runtime;
})(globalThis);
