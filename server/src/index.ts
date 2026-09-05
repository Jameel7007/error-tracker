import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { Db } from './db.ts'

const port = Number(process.env.PORT ?? 8787)
const databasePath = process.env.DATABASE_PATH ?? './data/error-tracker.sqlite'
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5180')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const db = Db.open(databasePath)
const app = createApp(db, { corsOrigins })

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Sync server listening on http://localhost:${info.port}`)
  console.log(`Database: ${databasePath}`)
  console.log(`Allowed origins: ${corsOrigins.join(', ') || '(none)'}`)
})

const shutdown = () => {
  db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
