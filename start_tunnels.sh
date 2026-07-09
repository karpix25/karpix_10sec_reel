#!/bin/bash
echo "Starting SSH tunnels to Easypanel databases on 144.91.103.207..."
echo "Tunnel 1 (NEW DB): localhost:5432 -> tools_baza"
echo "Tunnel 2 (OLD DB): localhost:5433 -> ai_avatars_postgres"

# New DB (tools_baza)
sshpass -p "sd2-fWe-3AN-ZCK" ssh -N -L 5432:10.11.0.22:5432 -o StrictHostKeyChecking=no root@144.91.103.207 &

# Old DB (n8n_ai_avatars)
sshpass -p "sd2-fWe-3AN-ZCK" ssh -N -L 5433:172.20.0.5:5432 -o StrictHostKeyChecking=no root@144.91.103.207 &

echo ""
echo "✅ Tunnels are running!"
echo "Now you can run 'npm run dev' in another terminal."
echo "Press Ctrl+C here to stop the tunnels when you're done."
wait
