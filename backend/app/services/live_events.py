import json
from typing import List, Dict, Any
from fastapi import WebSocket


class LiveEventManager:
    """
    Broadcasts real-time events to connected Human Agent Dashboards via WebSockets.
    """

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        message = json.dumps({"event": event_type, "data": data, "timestamp": data.get("timestamp")})
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead)


live_event_manager = LiveEventManager()
