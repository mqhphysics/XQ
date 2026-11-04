import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const destination = process.argv[2]

if (destination === undefined) {
  throw new Error('Usage: node scripts/copy-prisma-engine.mjs <destination>')
}

const sourceDirectory = resolve('src/generated/prisma')
const destinationDirectory = resolve(destination)
const entries = await readdir(sourceDirectory)
const engineFiles = entries.filter((entry) => /^(?:lib)?query_engine-.+\.node$/.test(entry))

if (engineFiles.length !== 1) {
  throw new Error(`Expected one Prisma query engine, found ${engineFiles.length}`)
}

await mkdir(destinationDirectory, { recursive: true })
const sourceEngine = resolve(sourceDirectory, engineFiles[0])
const destinationEngine = resolve(destinationDirectory, engineFiles[0])
let unchanged = false
try {
  const [sourceBytes, destinationBytes] = await Promise.all([
    readFile(sourceEngine),
    readFile(destinationEngine),
  ])
  unchanged = sourceBytes.equals(destinationBytes)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
// Windows locks loaded native libraries. An identical engine already satisfies
// the build; a genuinely changed engine must still be copied or fail visibly.
if (!unchanged) await copyFile(sourceEngine, destinationEngine)
