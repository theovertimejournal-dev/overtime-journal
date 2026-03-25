import { Client } from "colyseus.js";

export const client = new Client(import.meta.env.VITE_COLYSEUS_URL);
