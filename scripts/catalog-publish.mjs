#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir=process.cwd(), snapshotDir=resolve(rootDir,'catalog-snapshots')
const partSize=1900*1024*1024
const run=(command,args,options={})=>{const result=spawnSync(command,args,{cwd:rootDir,stdio:'inherit',...options});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);return result}
const digest=(path)=>new Promise((done,fail)=>{const hash=createHash('sha256'),stream=createReadStream(path);stream.on('data',(chunk)=>hash.update(chunk));stream.once('error',fail);stream.once('end',()=>done(hash.digest('hex')))})
const listSnapshots=async()=>(await readdir(snapshotDir).catch(()=>[])).filter((name)=>/^catalog-snapshot-.*\.zip$/i.test(name)).sort((a,b)=>b.localeCompare(a))

const resolveArchive=async()=>{
  const requested=process.argv.slice(2).find((argument)=>!argument.startsWith('--'))
  if(requested){const path=resolve(rootDir,requested);if(!/^catalog-snapshot-.*\.zip$/i.test(basename(path)))throw new Error('Ongeldige catalogus-snapshotnaam');await stat(path);return path}
  const existing=new Set(await listSnapshots());run(process.execPath,['./scripts/catalog-snapshot.mjs'])
  const created=(await listSnapshots()).find((name)=>!existing.has(name));if(!created)throw new Error('Snapshot gemaakt, maar archief niet gevonden');return resolve(snapshotDir,created)
}

const prepareAssets=async(archivePath)=>{
  const archiveName=basename(archivePath),archiveSize=(await stat(archivePath)).size
  if(archiveSize<=partSize)return[archivePath]
  for(const name of await readdir(snapshotDir))if(name.startsWith(`${archiveName}.part-`))await rm(resolve(snapshotDir,name),{force:true})
  run('split',['-b',String(partSize),'-d','-a','3',archivePath,`${archivePath}.part-`])
  const names=(await readdir(snapshotDir)).filter((name)=>name.startsWith(`${archiveName}.part-`)).sort(),parts=[]
  for(const name of names){const path=resolve(snapshotDir,name);parts.push({name,size:(await stat(path)).size,sha256:await digest(path)})}
  const manifestPath=resolve(snapshotDir,`${archiveName}.manifest.json`)
  await writeFile(manifestPath,`${JSON.stringify({version:1,archiveName,size:archiveSize,sha256:await digest(archivePath),parts},null,2)}\n`,'utf8')
  return[manifestPath,...parts.map((part)=>resolve(snapshotDir,part.name))]
}

const archivePath=await resolveArchive(),assets=await prepareAssets(archivePath)
const releaseTag=basename(archivePath,'.zip')
const releaseTitle=releaseTag.replace('catalog-snapshot-','Catalog snapshot · ').replace('_',' ')
const release=spawnSync('gh',['release','view',releaseTag,'--json','tagName'],{cwd:rootDir,stdio:'ignore'})
if(release.error)throw release.error
if(release.status===0)run('gh',['release','upload',releaseTag,...assets,'--clobber'])
else run('gh',['release','create',releaseTag,...assets,'--title',releaseTitle,'--notes',`Verified Keepit catalog backup: ${basename(archivePath)}`,'--latest=false'])
console.log(`Published ${basename(archivePath)} as ${assets.length} GitHub Release asset(s).`)
