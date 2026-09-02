from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.live_events import live_event_manager

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    """
    Live WebSocket connection endpoint for real-time dashboard updates.
    """
    await live_event_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and accept ping/pong or client action messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        live_event_manager.disconnect(websocket)
