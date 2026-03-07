import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nuemrevwtawatrjsmxbj.supabase.co'
const supabaseKey = 'sb_publishable_qgVf9K95mp8tle1baEZz9g_fDI5R8RK'

export const supabase = createClient(supabaseUrl, supabaseKey)
```

Save with `Ctrl + S`. Now let's push this whole project to GitHub. Go to your terminal, press `Ctrl + C` to stop the server, then run these one at a time:
```
git init
```
```
git add .
```
```
git commit -m "OTJ initial scaffold - Vite + React + Tailwind + Supabase"