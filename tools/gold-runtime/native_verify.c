/* Independent native/WASM output comparison driver. No game data included. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
int gold_open(uint8_t*,unsigned,uint8_t*,unsigned,unsigned,int);
int gold_frame(void); void gold_key(int,int); void gold_close(void);
uint32_t *gold_pixels(void); int16_t *gold_audio(void);
static uint8_t *read_file(const char *path,unsigned *size){FILE *f=fopen(path,"rb");if(!f){perror(path);exit(1);}fseek(f,0,SEEK_END);*size=ftell(f);rewind(f);uint8_t *p=malloc(*size);if(fread(p,1,*size,f)!=*size)exit(1);fclose(f);return p;}
int main(int argc,char **argv){if(argc!=5){fprintf(stderr,"Usage: native_verify ROM BOOT FRAME_COUNT OUTPUT\n");return 1;}unsigned nr,nb;uint8_t *r=read_file(argv[1],&nr),*b=read_file(argv[2],&nb);if(gold_open(r,nr,b,nb,48000,1))return 1;free(r);free(b);FILE *f=fopen(argv[4],"wb");if(!f)return 1;int frames=atoi(argv[3]);for(int i=0;i<frames;i++){if(i==900||i==1040)gold_key(7,1);if(i==910||i==1050)gold_key(7,0);int n=gold_frame();if(fwrite(gold_pixels(),1,160*144*4,f)!=160*144*4)return 1;fwrite(&n,sizeof(n),1,f);fwrite(gold_audio(),sizeof(int16_t),n*2,f);}fclose(f);gold_close();return 0;}
