/* Buffer-only SameBoy adapter, including two local consoles. See LICENSE.sameboy.
 * Cable callbacks/scheduling follow SameBoy Cocoa/Document.m. No game data. */
#include "gb.h"
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#define DEVICES 2
#define FRAME_TICKS 140448u /* 70224 LCD clocks in GB_run's 8MHz units */
/* SameBoy intentionally excludes output filters from its normal savestate.
 * Pair snapshots retain their pointer-free prefix so audio phase also resumes. */
#define AUDIO_STATE_SIZE offsetof(GB_apu_output_t,sample_callback)
#define EXTRA_STATE_SIZE (AUDIO_STATE_SIZE+64+160*144*sizeof(uint32_t))
typedef struct {
 GB_gameboy_t *gb;
 uint32_t pixels[160*144];
 int16_t samples[8192*2];
 unsigned sample_count,frame_count;
 bool outgoing_bit,infrared_on;
} Device;
static Device devices[DEVICES];
static unsigned connection;
static uint64_t ticks[DEVICES],pair_target;
static Device *device(int slot){return slot>=0&&slot<DEVICES?&devices[slot]:NULL;}
static Device *context(GB_gameboy_t *gb){return GB_get_user_data(gb);}
static Device *partner(Device *d){return d==&devices[0]?&devices[1]:&devices[0];}
static uint32_t rgb(GB_gameboy_t *gb,uint8_t r,uint8_t green,uint8_t b){return 0xff000000u|((uint32_t)b<<16)|((uint32_t)green<<8)|r;}
static void sample(GB_gameboy_t *gb,GB_sample_t *s){Device *d=context(gb);if(d->sample_count<8192){d->samples[d->sample_count*2]=s->left;d->samples[d->sample_count*2+1]=s->right;d->sample_count++;}}
static void serial_start(GB_gameboy_t *gb,bool bit){context(gb)->outgoing_bit=bit;}
static bool serial_end(GB_gameboy_t *gb){Device *d=context(gb),*other=partner(d);if(!(connection&1)||!other->gb)return true;bool incoming=GB_serial_get_data_bit(other->gb);GB_serial_set_data_bit(other->gb,d->outgoing_bit);return incoming;}
static void infrared(GB_gameboy_t *gb,bool on){Device *d=context(gb),*other=partner(d);d->infrared_on=on;if((connection&2)&&other->gb)GB_set_infrared_input(other->gb,on);}
void gold_disconnect(void){
 connection=0;for(int i=0;i<DEVICES;i++)if(devices[i].gb){GB_disconnect_serial(devices[i].gb);GB_set_infrared_callback(devices[i].gb,infrared);GB_set_infrared_input(devices[i].gb,false);GB_set_turbo_mode(devices[i].gb,true,false);}
}
int gold_connect(int mode){
 if(mode<0||mode>3)return -2;if(mode&&(!devices[0].gb||!devices[1].gb))return -1;
 gold_disconnect();connection=mode;ticks[0]=ticks[1]=pair_target=0;
 for(int i=0;i<DEVICES;i++){Device *d=&devices[i];if(!d->gb)continue;if(mode){GB_set_turbo_mode(d->gb,true,true);GB_set_turbo_cap(d->gb,0);}if(mode&1){GB_set_serial_transfer_bit_start_callback(d->gb,serial_start);GB_set_serial_transfer_bit_end_callback(d->gb,serial_end);}if(mode&2){GB_set_infrared_callback(d->gb,infrared);GB_set_infrared_input(d->gb,partner(d)->infrared_on);}}
 return 0;
}
unsigned gold_connection(void){return connection;}
void gold_close_device(int slot){Device *d=device(slot);if(!d)return;if(connection)gold_disconnect();if(d->gb){GB_dealloc(d->gb);d->gb=NULL;}d->sample_count=d->frame_count=0;}
int gold_loaded_device(int slot){Device *d=device(slot);return d&&d->gb;}
int gold_open_device(int slot,uint8_t *rom,unsigned size,uint8_t *boot,unsigned boot_size,unsigned rate,int deterministic){
 Device *d=device(slot);if(!d||!rom||!size)return -2;gold_close_device(slot);GB_random_seed(0xcabba6e5);d->gb=GB_init(GB_alloc(),GB_MODEL_CGB_E);if(!d->gb)return -1;
 GB_set_user_data(d->gb,d);GB_set_rgb_encode_callback(d->gb,rgb);GB_set_pixels_output(d->gb,d->pixels);GB_set_color_correction_mode(d->gb,GB_COLOR_CORRECTION_DISABLED);
 GB_set_sample_rate(d->gb,rate);GB_apu_set_sample_callback(d->gb,sample);GB_set_turbo_mode(d->gb,true,false);GB_set_rtc_mode(d->gb,deterministic?GB_RTC_MODE_ACCURATE:GB_RTC_MODE_SYNC_TO_HOST);
 GB_load_boot_rom_from_buffer(d->gb,boot,boot_size);GB_load_rom_from_buffer(d->gb,rom,size);GB_set_infrared_callback(d->gb,infrared);d->frame_count=d->sample_count=0;d->outgoing_bit=d->infrared_on=false;memset(d->pixels,0,sizeof(d->pixels));return 0;
}
int gold_frame_device(int slot){Device *d=device(slot);if(!d||!d->gb)return -1;d->sample_count=0;GB_run_frame(d->gb);d->frame_count++;return d->sample_count;}
/* Every core is CGB-E, so GB_run's normalized 8MHz ticks have equal duration,
 * including when one CPU enters double speed. Do not alternate whole frames. */
int gold_pair_ticks(unsigned duration){
 if(!devices[0].gb||!devices[1].gb||!connection)return -1;
 if(duration>FRAME_TICKS||pair_target>UINT64_MAX-FRAME_TICKS-128)return -2;
 devices[0].sample_count=devices[1].sample_count=0;pair_target+=duration;
 while(ticks[0]<pair_target||ticks[1]<pair_target){int i=ticks[0]<=ticks[1]?0:1;unsigned elapsed=GB_run(devices[i].gb);if(!elapsed)return -2;ticks[i]+=elapsed;}
 return devices[0].sample_count;
}
int gold_pair_frame(void){int n=gold_pair_ticks(FRAME_TICKS);if(n>=0){devices[0].frame_count++;devices[1].frame_count++;}return n;}
double gold_ticks_device(int slot){return slot>=0&&slot<DEVICES?(double)ticks[slot]:0;}
void gold_key_device(int slot,int key,int down){Device *d=device(slot);if(d&&d->gb&&key>=0&&key<GB_KEY_MAX)GB_set_key_state(d->gb,key,down);}
uint32_t *gold_pixels_device(int slot){Device *d=device(slot);return d?d->pixels:NULL;}
int16_t *gold_audio_device(int slot){Device *d=device(slot);return d?d->samples:NULL;}
unsigned gold_audio_size_device(int slot){Device *d=device(slot);return d?d->sample_count:0;}
unsigned gold_frames_device(int slot){Device *d=device(slot);return d?d->frame_count:0;}
void gold_set_frames_device(int slot,unsigned count){Device *d=device(slot);if(d)d->frame_count=count;}
unsigned gold_state_size_device(int slot){Device *d=device(slot);return d&&d->gb?GB_get_save_state_size(d->gb):0;}
void gold_state_write_device(int slot,uint8_t *out){Device *d=device(slot);if(d&&d->gb)GB_save_state_to_buffer(d->gb,out);}
int gold_state_read_device(int slot,uint8_t *in,unsigned size){Device *d=device(slot);return d&&d->gb?GB_load_state_from_buffer(d->gb,in,size):-1;}
unsigned gold_battery_size_device(int slot){Device *d=device(slot);return d&&d->gb?GB_save_battery_size(d->gb):0;}
int gold_battery_write_device(int slot,uint8_t *out,unsigned size){Device *d=device(slot);return d&&d->gb?GB_save_battery_to_buffer(d->gb,out,size):-1;}
void gold_battery_read_device(int slot,uint8_t *in,unsigned size){Device *d=device(slot);if(d&&d->gb)GB_load_battery_from_buffer(d->gb,in,size);}
unsigned gold_read_device(int slot,unsigned addr){Device *d=device(slot);return d&&d->gb?GB_read_memory(d->gb,addr):0;}
void gold_write_device(int slot,unsigned addr,unsigned value){Device *d=device(slot);if(d&&d->gb)GB_write_memory(d->gb,addr,value);}
unsigned gold_pc_device(int slot){Device *d=device(slot);return d&&d->gb?GB_get_registers(d->gb)->pc:0;}
/* Pair snapshots include the cable latch and scheduler, which single-core save
 * states cannot capture. Restore both cores transactionally before reconnecting. */
static void put32(uint8_t *p,uint32_t n){for(int i=0;i<4;i++)p[i]=n>>(i*8);}
static uint32_t get32(const uint8_t *p){uint32_t n=0;for(int i=0;i<4;i++)n|=(uint32_t)p[i]<<(i*8);return n;}
static void put64(uint8_t *p,uint64_t n){put32(p,n);put32(p+4,n>>32);}
static uint64_t get64(const uint8_t *p){return get32(p)|((uint64_t)get32(p+4)<<32);}
static uint32_t pair_checksum(const uint8_t *p,unsigned size){uint32_t h=2166136261u;for(unsigned i=0;i<size;i++){h^=(i>=12&&i<16)?0:p[i];h*=16777619u;}return h;}
/* Pair states are from this pinned core, never a BESS fallback (which drops
 * sub-instruction serial state). Validate section bounds before core parsing. */
static bool native_layout(Device *d,const uint8_t *in,unsigned size){
 if(size<8||get32(in)!=d->gb->magic||get32(in+4)!=d->gb->version)return false;
 const unsigned sections[]={GB_SECTION_SIZE(core_state),GB_SECTION_SIZE(dma),GB_SECTION_SIZE(mbc),GB_SECTION_SIZE(hram),GB_SECTION_SIZE(timing),GB_SECTION_SIZE(apu),GB_SECTION_SIZE(rtc),GB_SECTION_SIZE(video),GB_SECTION_SIZE(accessory)};
 unsigned at=8;for(unsigned i=0;i<sizeof(sections)/sizeof(sections[0]);i++){if(at+4>size||get32(in+at)!=sections[i]||sections[i]>size-at-4)return false;at+=4+sections[i];}return true;
}
static void save_extra(Device *d,uint8_t *out){
 GB_gameboy_t *gb=d->gb;memset(out,0,EXTRA_STATE_SIZE);memcpy(out,&gb->apu_output,AUDIO_STATE_SIZE);out+=AUDIO_STATE_SIZE;
 memcpy(out,&gb->apu_output.interference_volume,8);memcpy(out+8,&gb->apu_output.interference_highpass,8);out[16]=gb->apu_output.square_sweep_disable_stepping;
 memcpy(out+17,gb->keys,32);put32(out+52,gb->pending_cycles);out[56]=gb->joypad_is_stable;out[57]=gb->joyp_accessed;
 memcpy(out+64,d->pixels,sizeof(d->pixels));
}
static void load_extra(Device *d,const uint8_t *in){
 GB_gameboy_t *gb=d->gb;memcpy(&gb->apu_output,in,AUDIO_STATE_SIZE);in+=AUDIO_STATE_SIZE;
 memcpy(&gb->apu_output.interference_volume,in,8);memcpy(&gb->apu_output.interference_highpass,in+8,8);gb->apu_output.square_sweep_disable_stepping=!!in[16];
 for(int p=0;p<4;p++)for(int k=0;k<GB_KEY_MAX;k++)gb->keys[p][k]=!!in[17+p*GB_KEY_MAX+k];gb->pending_cycles=get32(in+52);gb->joypad_is_stable=!!in[56];gb->joyp_accessed=!!in[57];
 memcpy(d->pixels,in+64,sizeof(d->pixels));
}
unsigned gold_pair_state_size(void){return devices[0].gb&&devices[1].gb?64+gold_state_size_device(0)+gold_state_size_device(1)+2*EXTRA_STATE_SIZE:0;}
int gold_pair_state_write(uint8_t *out,unsigned size){
 unsigned n=gold_pair_state_size();if(!n||size!=n)return -1;memset(out,0,64);memcpy(out,"GLNK0001",8);put32(out+8,connection);put64(out+16,ticks[0]);put64(out+24,ticks[1]);put64(out+32,pair_target);
 out[40]=devices[0].outgoing_bit;out[41]=devices[1].outgoing_bit;out[42]=devices[0].infrared_on;out[43]=devices[1].infrared_on;
 put32(out+44,devices[0].frame_count);put32(out+48,devices[1].frame_count);put32(out+52,gold_state_size_device(0));put32(out+56,gold_state_size_device(1));put32(out+60,EXTRA_STATE_SIZE);
 gold_state_write_device(0,out+64);gold_state_write_device(1,out+64+gold_state_size_device(0));uint8_t *extra=out+64+gold_state_size_device(0)+gold_state_size_device(1);save_extra(&devices[0],extra);save_extra(&devices[1],extra+EXTRA_STATE_SIZE);put32(out+12,pair_checksum(out,size));return 0;
}
int gold_pair_state_read(uint8_t *in,unsigned size){
 if(!devices[0].gb||!devices[1].gb||size<64||memcmp(in,"GLNK0001",8)||get32(in+8)>3)return -1;
 unsigned n0=get32(in+52),n1=get32(in+56);if(n0!=gold_state_size_device(0)||n1!=gold_state_size_device(1)||get32(in+60)!=EXTRA_STATE_SIZE||size!=64+n0+n1+2*EXTRA_STATE_SIZE||get32(in+12)!=pair_checksum(in,size))return -1;
 if(!native_layout(&devices[0],in+64,n0)||!native_layout(&devices[1],in+64+n0,n1))return -1;
 uint64_t t0=get64(in+16),t1=get64(in+24),target=get64(in+32);if(target>UINT64_MAX-FRAME_TICKS-128||t0<target||t1<target||t0>target+128||t1>target+128||in[40]>1||in[41]>1||in[42]>1||in[43]>1)return -1;
 uint8_t *backup=malloc(n0+n1+2*EXTRA_STATE_SIZE);if(!backup)return -1;gold_state_write_device(0,backup);gold_state_write_device(1,backup+n0);save_extra(&devices[0],backup+n0+n1);save_extra(&devices[1],backup+n0+n1+EXTRA_STATE_SIZE);
 int ok=gold_state_read_device(0,in+64,n0);if(!ok)ok=gold_state_read_device(1,in+64+n0,n1);
 if(ok){gold_state_read_device(0,backup,n0);gold_state_read_device(1,backup+n0,n1);load_extra(&devices[0],backup+n0+n1);load_extra(&devices[1],backup+n0+n1+EXTRA_STATE_SIZE);free(backup);return -1;}free(backup);
 load_extra(&devices[0],in+64+n0+n1);load_extra(&devices[1],in+64+n0+n1+EXTRA_STATE_SIZE);
 devices[0].outgoing_bit=in[40];devices[1].outgoing_bit=in[41];devices[0].infrared_on=in[42];devices[1].infrared_on=in[43];gold_connect(get32(in+8));ticks[0]=t0;ticks[1]=t1;pair_target=target;
 devices[0].frame_count=get32(in+44);devices[1].frame_count=get32(in+48);devices[0].sample_count=devices[1].sample_count=0;return 0;
}
/* Backwards-compatible one-console ABI. */
void gold_close(void){gold_close_device(0);}
int gold_open(uint8_t *rom,unsigned size,uint8_t *boot,unsigned boot_size,unsigned rate,int deterministic){return gold_open_device(0,rom,size,boot,boot_size,rate,deterministic);}
int gold_frame(void){return gold_frame_device(0);}
void gold_key(int key,int down){gold_key_device(0,key,down);}
uint32_t *gold_pixels(void){return gold_pixels_device(0);} int16_t *gold_audio(void){return gold_audio_device(0);}
unsigned gold_frames(void){return gold_frames_device(0);} unsigned gold_state_size(void){return gold_state_size_device(0);}
void gold_state_write(uint8_t *out){gold_state_write_device(0,out);} int gold_state_read(uint8_t *in,unsigned size){return gold_state_read_device(0,in,size);}
unsigned gold_battery_size(void){return gold_battery_size_device(0);} int gold_battery_write(uint8_t *out,unsigned size){return gold_battery_write_device(0,out,size);}
void gold_battery_read(uint8_t *in,unsigned size){gold_battery_read_device(0,in,size);} unsigned gold_read(unsigned addr){return gold_read_device(0,addr);}
void gold_write(unsigned addr,unsigned value){gold_write_device(0,addr,value);} unsigned gold_pc(void){return gold_pc_device(0);}
