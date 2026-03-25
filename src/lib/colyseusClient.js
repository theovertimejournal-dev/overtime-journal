import { Client } from "colyseus.js";

export const client = new Client(import.meta.env.VITE_COLYSEUS_URL);
```

Then make sure your `.env` file (or Vercel environment variables) has:
```
VITE_COLYSEUS_URL=wss://your-railway-app.up.railway.app
