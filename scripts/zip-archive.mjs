// Minimal ZIP writer and reader for the maintenance tools' backups. Each backup
// is one .zip file instead of a folder of loose files, because the project
// folder is synced by Dropbox and every file there costs a sync. Windows
// Explorer opens these archives; extracting one into the project folder puts
// the backed-up files back in place.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {deflateRawSync,inflateRawSync} from 'node:zlib';

const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function dosTime(date){
  const d=date instanceof Date&&!Number.isNaN(date.getTime())&&date.getFullYear()>=1980?date:new Date(1980,0,1);
  return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};
}
// entries: [{name:'folder/file.txt', bytes:Buffer|string, date?:Date}]. Names use '/'.
export function zipBuffer(entries){
  if(entries.length>=0xffff)throw Error('Too many files for one backup archive.');
  const local=[],central=[];let offset=0;
  const names=new Set();
  for(const entry of entries){
    const name=String(entry.name).replaceAll('\\','/');
    if(!name||name.startsWith('/')||name.split('/').includes('..')||names.has(name))throw Error(`Invalid or repeated archive name: ${name}`);
    names.add(name);
    const data=Buffer.isBuffer(entry.bytes)?entry.bytes:Buffer.from(entry.bytes);
    const deflated=deflateRawSync(data,{level:9}),stored=deflated.length>=data.length;
    const body=stored?data:deflated,crc=crc32(data),{time,date}=dosTime(entry.date??new Date()),nameBytes=Buffer.from(name,'utf8');
    if(data.length>=0xffffffff||offset+body.length>=0xffffffff)throw Error('A backup archive cannot exceed 4 GB.');
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(stored?0:8,8);
    header.writeUInt16LE(time,10);header.writeUInt16LE(date,12);header.writeUInt32LE(crc,14);
    header.writeUInt32LE(body.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(nameBytes.length,26);
    const record=Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x0800,8);record.writeUInt16LE(stored?0:8,10);
    record.writeUInt16LE(time,12);record.writeUInt16LE(date,14);record.writeUInt32LE(crc,16);
    record.writeUInt32LE(body.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(nameBytes.length,28);record.writeUInt32LE(offset,42);
    local.push(header,nameBytes,body);central.push(record,nameBytes);
    offset+=header.length+nameBytes.length+body.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
// Returns Map name → Buffer, checking every CRC.
export function unzipBuffer(zip){
  const at=zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(at<0)throw Error('Not a ZIP archive.');
  const count=zip.readUInt16LE(at+10),files=new Map();
  let p=zip.readUInt32LE(at+16);
  for(let i=0;i<count;i++){
    if(zip.readUInt32LE(p)!==0x02014b50)throw Error('Damaged ZIP directory.');
    const method=zip.readUInt16LE(p+10),crc=zip.readUInt32LE(p+16),size=zip.readUInt32LE(p+20),nameLength=zip.readUInt16LE(p+28),extra=zip.readUInt16LE(p+30),comment=zip.readUInt16LE(p+32),offset=zip.readUInt32LE(p+42);
    const name=zip.subarray(p+46,p+46+nameLength).toString('utf8');
    const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28),body=zip.subarray(start,start+size);
    const data=method===0?Buffer.from(body):method===8?inflateRawSync(body):null;
    if(!data||crc32(data)!==crc)throw Error(`Damaged ZIP entry: ${name}`);
    files.set(name,data);
    p+=46+nameLength+extra+comment;
  }
  return files;
}
// Write the archive beside its final name, then rename, and check it reads back.
export async function writeZip(file,entries){
  const bytes=zipBuffer(entries),files=unzipBuffer(bytes);
  for(const entry of entries)if(!files.get(String(entry.name).replaceAll('\\','/')).equals(Buffer.isBuffer(entry.bytes)?entry.bytes:Buffer.from(entry.bytes)))throw Error('The backup archive did not read back correctly.');
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=file+'.'+randomUUID().slice(0,8)+'.tmp';
  try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,file);}
  finally{await fs.rm(temporary,{force:true});}
  return file;
}
export async function readZip(file){return unzipBuffer(await fs.readFile(file));}
