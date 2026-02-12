#!/usr/bin/env python3
"""
Tankoban Pro Build 13 - Embedded Canvas Player Architecture

Replicates Build 110 embedded mode:
- Stage-first layout with stable geometry
- Non-interactive render surface with intentional event routing  
- Top strip chips (Tracks, Speed, Playlist, Quality, Info, Fullscreen)
- Stage-anchored context menu with submenus
- Real track selectors (not just cycling)
- Folder-scoped playlist panel

Critical: Showing/hiding controls NEVER changes render host geometry.
"""

import argparse
import ctypes
import json
import re
import os
import subprocess
import sys
import time
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PySide6.QtCore import QEvent, QObject, QPropertyAnimation, QTimer, Qt, QEasingCurve, QUrl, Signal, QPoint, QRect
from PySide6.QtGui import QAction, QWheelEvent, QDesktopServices, QClipboard, QPainter, QColor, QPen, QKeySequence, QIcon, QCursor, QGuiApplication, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPushButton,
    QSlider,
    QToolButton,
    QVBoxLayout,
    QWidget,
    QStyle,
    QStyleOptionSlider,
    QSizePolicy,
    QDialog,
    QListWidget,
    QListWidgetItem,
    QScrollArea,
    QFrame,
    QGridLayout,
    QButtonGroup,
    QRadioButton,
    QCheckBox,
    QSpinBox,
    QDoubleSpinBox,
    QFileDialog,)

from PySide6.QtNetwork import QLocalServer, QLocalSocket


def _prepend_to_path(dir_path: Path) -> None:
    """Ensure the given directory is at the front of PATH for DLL discovery."""
    try:
        p = str(dir_path)
        if not p:
            return
        cur = os.environ.get("PATH", "")
        if cur.split(os.pathsep) and cur.split(os.pathsep)[0].lower() == p.lower():
            return
        os.environ["PATH"] = p + os.pathsep + cur
    except Exception:
        return


def ensure_mpv_dll_on_path() -> None:
    """Make mpv DLL discovery deterministic on Windows."""
    override = os.environ.get("TANKOBAN_MPV_DLL_DIR", "").strip()
    if override:
        _prepend_to_path(Path(override))
        return
    
    here = Path(__file__).resolve().parent
    candidates = [
        (here.parent / "resources" / "mpv" / "windows"),
        (here.parent / "resources" / "mpv"),
        here,
    ]
    for c in candidates:
        if (c / "libmpv-2.dll").exists() or (c / "mpv-2.dll").exists() or (c / "mpv-1.dll").exists():
            _prepend_to_path(c)
            return


ensure_mpv_dll_on_path()

try:
    import mpv
except Exception as e:
    mpv = None
    IMPORT_ERR = e


def atomic_write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".{int(time.time() * 1000)}.tmp")
    tmp.write_text(json.dumps(obj, indent=2), encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _safe_mpv_log(level, prefix, text) -> None:
    """Best-effort mpv log sink that never throws on Windows cp1252 consoles."""
    try:
        msg = f"[mpv:{prefix}] {text}".rstrip()
    except Exception:
        return
    try:
        print(msg)
        return
    except UnicodeEncodeError:
        pass
    except Exception:
        return

    try:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        safe = msg.encode(enc, errors="replace").decode(enc, errors="replace")
        print(safe)
    except Exception:
        pass


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--file", dest="file_path", required=True)
    p.add_argument("--start", dest="start_seconds", type=float, default=0.0)
    p.add_argument("--session", dest="session_id", default="")
    p.add_argument("--progress-file", dest="progress_file", default="")
    p.add_argument("--title", dest="title", default="Tankoban Player")
    p.add_argument("--video-id", dest="video_id", default="")
    p.add_argument("--show-id", dest="show_id", default="")
    p.add_argument("--playlist-file", dest="playlist_file", default="")
    p.add_argument("--playlist-index", dest="playlist_index", type=int, default=-1)
    p.add_argument("--command-file", dest="command_file", default="")
    p.add_argument("--show-root", dest="show_root_path", default="")
    # BUILD22: Persist and restore user track preferences across sessions (best-effort)
    p.add_argument("--pref-aid", dest="pref_aid", default="")
    p.add_argument("--pref-sid", dest="pref_sid", default="")
    p.add_argument("--pref-sub-visibility", dest="pref_sub_visibility", default="")
    p.add_argument("--fullscreen", dest="start_fullscreen", action="store_true", default=False)  # BUILD14
    p.add_argument("--win-x", dest="win_x", type=int, default=None)
    p.add_argument("--win-y", dest="win_y", type=int, default=None)
    p.add_argument("--win-w", dest="win_w", type=int, default=None)
    p.add_argument("--win-h", dest="win_h", type=int, default=None)
    p.add_argument("--parent-hwnd", dest="parent_hwnd", type=int, default=0)
    args, _unknown = p.parse_known_args()
    return args


def _sanitize_ipc_name(s: str) -> str:
    """Sanitize IPC server name (no slashes; keep it stable across platforms)."""
    try:
        s = str(s or "")
    except Exception:
        s = ""
    s = s.strip()
    if not s:
        return ""
    # Replace path separators and other problematic chars with underscore
    s = s.replace("\\", "_").replace("/", "_").replace(":", "_")
    s = re.sub(r"[^A-Za-z0-9_.-]+", "_", s)
    # Avoid extremely long names
    return s[:80] if len(s) > 80 else s


def _ipc_server_name(session_id: str = "") -> str:
    base = "TankobanPlayer"
    sid = _sanitize_ipc_name(session_id)
    if sid:
        base = f"{base}_{sid}"
    # QLocalServer name must not contain slashes
    base = base.replace("/", "_").replace("\\", "_")
    return base


def _try_send_ipc_open(server_name: str, payload: Dict[str, Any], timeout_ms: int = 250) -> bool:
    """Try to connect to an existing local server and send one JSON line."""
    try:
        sock = QLocalSocket()
        sock.connectToServer(server_name)
        if not sock.waitForConnected(int(timeout_ms)):
            try:
                sock.abort()
            except Exception:
                pass
            sock.deleteLater()
            return False

        try:
            data = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        except Exception:
            data = (json.dumps(payload) + "\n").encode("utf-8")

        sock.write(data)
        try:
            sock.flush()
        except Exception:
            pass
        sock.waitForBytesWritten(int(timeout_ms))
        sock.disconnectFromServer()
        sock.waitForDisconnected(int(timeout_ms))
        sock.deleteLater()
        return True
    except Exception:
        return False


def _start_ipc_server(server_name: str, parent: Optional[QObject] = None) -> Optional[QLocalServer]:
    """Create and listen on a QLocalServer (remove stale server first)."""
    try:
        try:
            QLocalServer.removeServer(server_name)
        except Exception:
            pass

        srv = QLocalServer(parent)
        if not srv.listen(server_name):
            # One more attempt after removing stale
            try:
                srv.close()
            except Exception:
                pass
            try:
                QLocalServer.removeServer(server_name)
            except Exception:
                pass
            try:
                if not srv.listen(server_name):
                    return None
            except Exception:
                return None
        return srv
    except Exception:
        return None


def _attach_ipc_server_to_window(server: QLocalServer, window: "PlayerWindow") -> None:
    """Route incoming IPC messages to an existing PlayerWindow instance."""
    if not server:
        return

    def _handle_socket(sock: QLocalSocket) -> None:
        try:
            sock.setProperty("_ipc_buf", b"")
        except Exception:
            pass

        def _drain_and_process(final: bool = False) -> None:
            try:
                buf = b""
                try:
                    buf = sock.property("_ipc_buf") or b""
                except Exception:
                    buf = b""

                try:
                    chunk = bytes(sock.readAll())
                except Exception:
                    chunk = b""

                if chunk:
                    buf = (buf or b"") + chunk

                # Process first full line (JSON + '\n'); if no newline yet, wait unless final.
                line = None
                if b"\n" in (buf or b""):
                    line, rest = buf.split(b"\n", 1)
                    buf = rest
                elif final:
                    line = buf
                    buf = b""

                try:
                    sock.setProperty("_ipc_buf", buf)
                except Exception:
                    pass

                if line is None:
                    return

                try:
                    s = line.decode("utf-8", errors="replace").strip()
                except Exception:
                    s = ""

                if not s:
                    return

                try:
                    msg = json.loads(s)
                except Exception:
                    msg = None

                if isinstance(msg, dict):
                    try:
                        window._handle_ipc_payload(msg)
                    except Exception:
                        pass
            except Exception:
                pass

        sock.readyRead.connect(lambda: _drain_and_process(final=False))
        sock.disconnected.connect(lambda: _drain_and_process(final=True))
        sock.disconnected.connect(sock.deleteLater)

        # Drain immediately in case data is already available.
        QTimer.singleShot(0, lambda: _drain_and_process(final=False))

    def _on_new_connection() -> None:
        try:
            while server.hasPendingConnections():
                s = server.nextPendingConnection()
                if s is None:
                    break
                _handle_socket(s)
        except Exception:
            pass

    try:
        server.newConnection.connect(_on_new_connection)
    except Exception:
        pass

    # Handle any already-pending connections.
    QTimer.singleShot(0, _on_new_connection)




def _fmt_time(seconds: Optional[float]) -> str:
    if seconds is None:
        return "--:--"
    try:
        s = int(max(0, seconds))
    except Exception:
        return "--:--"
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    if h > 0:
        return f"{h:d}:{m:02d}:{sec:02d}"
    return f"{m:d}:{sec:02d}"


def _is_video_file(path: str) -> bool:
    ext = Path(path).suffix.lower().lstrip(".")
    return ext in {
        "mp4", "mkv", "avi", "mov", "m4v", "webm", "ts", "m2ts",
        "wmv", "flv", "mpeg", "mpg", "3gp",
    }


def _finished(pos: Optional[float], dur: Optional[float], max_pos: Optional[float], watched: float, ended: bool) -> bool:
    if ended:
        return True
    try:
        if not dur or dur <= 0:
            return False
        p = pos if (pos is not None and pos >= 0) else 0.0
        mp = max_pos if (max_pos is not None and max_pos >= 0) else 0.0
        near_end = (p / dur) >= 0.98 or (mp / dur) >= 0.98
        watched_ok = (watched / dur) >= 0.80 if watched >= 0 else False
        return bool(near_end and watched_ok)
    except Exception:
        return False


def _natural_sort_key(filename: str) -> List:
    """Natural sort key for filenames."""
    import re
    parts = []
    for part in re.split(r'(\d+)', filename):
        if part.isdigit():
            parts.append(int(part))
        else:
            parts.append(part.lower())
    return parts


# ============================================================================
# Build 13 UI Components
# ============================================================================

class VolumeHUD(QWidget):
    """Smooth animated volume HUD overlay."""
    
    def __init__(self, parent: QWidget):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 10, 14, 10)
        layout.setSpacing(10)

        self.symbol_label = QLabel("◕")
        self.symbol_label.setStyleSheet(
            "font-size: 18px; color: rgba(255, 255, 255, 0.95); font-family: 'Segoe UI', 'Tahoma', sans-serif;"
        )
        layout.addWidget(self.symbol_label)

        self.bar_container = QWidget()
        self.bar_container.setFixedSize(140, 10)
        self.bar_container.setStyleSheet(
            "background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.35);"
        )
        self.bar = QWidget(self.bar_container)
        self.bar.setStyleSheet("background: rgba(255, 255, 255, 0.9);")
        layout.addWidget(self.bar_container)

        self.percent_label = QLabel("100%")
        self.percent_label.setStyleSheet(
            "font-size: 13px; font-weight: bold; color: rgba(255, 255, 255, 0.95);"
            "font-family: 'Segoe UI', 'Tahoma', sans-serif;"
        )
        layout.addWidget(self.percent_label)

        self.setStyleSheet("""
            QWidget {
                background: rgba(0, 0, 0, 0.68);
                border-radius: 4px;
                border: 2px solid rgba(255, 255, 255, 0.35);
            }
        """)
        
        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(0.0)
        
        self.fade_anim = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        
        self.hide_timer = QTimer(self)
        self.hide_timer.setSingleShot(True)
        self.hide_timer.timeout.connect(self._fade_out)
        
        self.hide()
    
    def show_volume(self, volume: int):
        volume = max(0, min(100, volume))
        self.percent_label.setText(f"{volume}%")
        bar_width = int(140 * volume / 100)
        self.bar.setGeometry(0, 0, bar_width, 10)
        
        if volume == 0:
            self.symbol_label.setText("⊘")
        elif volume < 33:
            self.symbol_label.setText("◔")
        elif volume < 66:
            self.symbol_label.setText("◑")
        else:
            self.symbol_label.setText("◕")
        
        parent = self.parent()
        if parent:
            self.adjustSize()
            x = (parent.width() - self.width()) // 2
            y = parent.height() // 3
            self.move(x, y)
        
        self.show()
        self.fade_anim.stop()
        self.fade_anim.setDuration(150)
        self.fade_anim.setStartValue(self.opacity_effect.opacity())
        self.fade_anim.setEndValue(1.0)
        self.fade_anim.start()
        
        self.hide_timer.stop()
        self.hide_timer.start(1000)
    
    def _fade_out(self):
        self.fade_anim.stop()
        self.fade_anim.setDuration(200)
        self.fade_anim.setStartValue(self.opacity_effect.opacity())
        self.fade_anim.setEndValue(0.0)
        self.fade_anim.finished.connect(self.hide)
        self.fade_anim.start()


class MpvRenderHost(QWidget):
    """
    Build 13 Render Host - Non-interactive surface with intentional event routing.
    
    Equivalent of #mpvHost in Build 110. Routes specific events only:
    - Wheel for volume
    - Right-click for menu
    - Mouse movement for edge reveal
    """
    
    wheel_volume_signal = Signal(int)
    right_click_signal = Signal(QPoint)
    mouse_move_signal = Signal(QPoint)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setStyleSheet("background-color: black;")
        self._mpv_instance = None
    
        # Build 20.5: Click tracking for double-click detection
        self._left_click_last_t = None
    def attach_mpv(self, mpv_instance):
        try:
            self._mpv_instance = mpv_instance
            self._mpv_instance.wid = str(int(self.winId()))
        except Exception as e:
            print(f"MpvRenderHost attach_mpv error: {e}")
    
    def wheelEvent(self, event: QWheelEvent):
        try:
            delta = event.angleDelta().y()
            self.wheel_volume_signal.emit(delta)
        except Exception:
            pass
        event.accept()
    
    def mousePressEvent(self, event):
        try:
            # Right click: context menu (preserve existing behavior)
            if event.button() == Qt.MouseButton.RightButton:
                global_pos = self.mapToGlobal(event.pos())
                self.right_click_signal.emit(global_pos)
                event.accept()
                return

            # Left click: dismiss overlays (if any) and keep focus.
            # IMPORTANT: do NOT play/pause on click (prevents double-click causing a single-click toggle).
            if event.button() == Qt.MouseButton.LeftButton:
                w = self.window()
                try:
                    if w and hasattr(w, "_dismiss_overlays_on_click") and w._dismiss_overlays_on_click():
                        event.accept()
                        return
                except Exception:
                    pass

                # Keep hotkeys working after click
                try:
                    if w:
                        w.activateWindow()
                        w.raise_()
                        w.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                        w.grabKeyboard()
                except Exception:
                    pass
                try:
                    self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                except Exception:
                    pass

                event.accept()
                return
        except Exception:
            pass
        event.ignore()



    

    def mouseDoubleClickEvent(self, event):
        """Double-click toggles fullscreen (left button only)."""
        try:
            if event.button() == Qt.MouseButton.LeftButton:
                # Build 20.5: Clear click timestamp so double-click is clean
                try:
                    self._left_click_last_t = None
                except Exception:
                    pass
                w = self.window()
                if w and hasattr(w, '_toggle_fullscreen'):
                    w._toggle_fullscreen()
                # Keep keys/hotkeys reliable after toggling
                try:
                    if w:
                        w.activateWindow()
                        w.raise_()
                        w.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                        w.grabKeyboard()
                except Exception:
                    pass
                try:
                    self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                except Exception:
                    pass
                event.accept()
                return
        except Exception:
            pass
        event.ignore()
    def mouseMoveEvent(self, event):
        try:
            w = self.window()
            if w and hasattr(w, "_on_mouse_activity"):
                w._on_mouse_activity(event.pos())
            elif w and hasattr(w, "_handle_mouse_move_for_hud"):
                # Fallback
                w._handle_mouse_move_for_hud(event.pos())
        except Exception:
            pass
        event.accept()



class ChipButton(QPushButton):
    """Lightweight chip-style button for top strip (minimal + transparent)."""

    def __init__(self, text: str, parent=None):
        super().__init__(text, parent)
        self.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(70, 70, 70, 0.95),
                    stop:0.45 rgba(48, 48, 48, 0.98),
                    stop:1 rgba(28, 28, 28, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.75);
                border-top-color: rgba(120, 120, 120, 0.7);
                border-bottom-color: rgba(0, 0, 0, 0.85);
                border-radius: 3px;
                padding: 4px 10px;
                color: rgba(245, 245, 245, 0.98);
                font-size: 12px;
                font-weight: 600;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(92, 92, 92, 0.98),
                    stop:0.5 rgba(58, 58, 58, 0.98),
                    stop:1 rgba(32, 32, 32, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(24, 24, 24, 0.98),
                    stop:0.6 rgba(46, 46, 46, 0.98),
                    stop:1 rgba(72, 72, 72, 0.98));
                border-top-color: rgba(0, 0, 0, 0.9);
                border-bottom-color: rgba(120, 120, 120, 0.4);
            }
        """)
        self.setCursor(Qt.CursorShape.PointingHandCursor)



class TopStripWidget(QWidget):
    """Build 13 Top Strip - minimal, transparent chips."""

    back_clicked = Signal()
    tracks_clicked = Signal()
    # Legacy signals kept for compatibility (may be unused in this build)
    audio_clicked = Signal()
    subtitles_clicked = Signal()
    audio_delay_clicked = Signal()
    subtitle_delay_clicked = Signal()
    aspect_clicked = Signal()

    speed_clicked = Signal()
    playlist_clicked = Signal()
    quality_clicked = Signal()
    aspect_clicked = Signal()
    info_clicked = Signal()
    fullscreen_clicked = Signal()
    minimize_clicked = Signal()
    close_clicked = Signal()

    def __init__(self, title: str = "", parent=None):
        super().__init__(parent)

        self.setMouseTracking(True)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 6, 12, 6)
        layout.setSpacing(8)

        self.title_label = QLabel(title)
        self.title_label.setStyleSheet(
            "color: rgba(255, 255, 255, 0.92); font-size: 12px; font-weight: 500;"
        )
        self.title_label.setMinimumWidth(120)
        self.title_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        layout.addWidget(self.title_label)

        layout.addStretch()

        self.minimize_btn = self._make_strip_button("—", "Minimize")
        self.minimize_btn.clicked.connect(self.minimize_clicked)
        layout.addWidget(self.minimize_btn)

        self.fullscreen_btn = self._make_strip_button("▢", "Fullscreen")
        self.fullscreen_btn.clicked.connect(self.fullscreen_clicked)
        layout.addWidget(self.fullscreen_btn)

        self.close_btn = self._make_strip_button("✕", "Close")
        self.close_btn.clicked.connect(self.close_clicked)
        layout.addWidget(self.close_btn)

        self.setStyleSheet(
            "background: rgba(12, 12, 12, 0.45);"
            "border-bottom: 1px solid rgba(255, 255, 255, 0.08);"
        )

    def _make_strip_button(self, label: str, tooltip: str) -> QPushButton:
        btn = QPushButton(label)
        btn.setToolTip(tooltip)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(78, 78, 78, 0.98),
                    stop:0.5 rgba(50, 50, 50, 0.98),
                    stop:1 rgba(28, 28, 28, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.75);
                border-top-color: rgba(130, 130, 130, 0.65);
                border-bottom-color: rgba(0, 0, 0, 0.85);
                border-radius: 3px;
                padding: 2px 6px;
                color: rgba(245, 245, 245, 0.96);
                font-size: 11px;
                font-weight: 600;
                min-width: 22px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(98, 98, 98, 0.98),
                    stop:0.5 rgba(62, 62, 62, 0.98),
                    stop:1 rgba(34, 34, 34, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(26, 26, 26, 0.98),
                    stop:0.6 rgba(52, 52, 52, 0.98),
                    stop:1 rgba(82, 82, 82, 0.98));
                border-top-color: rgba(0, 0, 0, 0.9);
                border-bottom-color: rgba(140, 140, 140, 0.35);
            }
        """)
        return btn

    def set_title(self, title: str):
        self.title_label.setText(title)

    def set_speed_label(self, speed: float):
        try:
            btn = getattr(self, "speed_btn", None)
            if btn:
                btn.setText(f"{speed:.1f}×")
        except Exception:
            pass





    def enterEvent(self, event):
        try:
            w = self.window()
            if w and hasattr(w, "_arm_controls_autohide"):
                if getattr(w, "_controls_visible", False):
                    w._arm_controls_autohide()
        except Exception:
            pass
        try:
            return super().enterEvent(event)
        except Exception:
            pass

    def mouseMoveEvent(self, event):
        try:
            w = self.window()
            if w and hasattr(w, "_arm_controls_autohide"):
                if getattr(w, "_controls_visible", False):
                    w._arm_controls_autohide()
        except Exception:
            pass
        try:
            return super().mouseMoveEvent(event)
        except Exception:
            pass

class SeekSlider(QSlider):
    """Thin scrubber slider with a hover time bubble + reliable click/drag seeking."""

    seek_fraction_requested = Signal(float)

    def __init__(self, orientation, parent=None):
        super().__init__(orientation, parent)
        self._duration: Optional[float] = None
        self._chapters: List[float] = []
        self._dragging = False

        self._bubble = QLabel(self)
        self._bubble.setStyleSheet(
            """
            QLabel {
                background: rgba(12, 12, 12, 0.78);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                padding: 4px 8px;
                font-size: 11px;
            }
            """
        )
        self._bubble.hide()
        self.setMouseTracking(True)

    # ---- Public API ----

    def set_duration(self, dur: Optional[float]):
        try:
            self._duration = float(dur) if dur is not None else None
        except Exception:
            self._duration = None

    def set_chapters(self, chapters: Optional[List[float]]):
        """Set chapter times (seconds) to paint small markers on the scrubber."""
        try:
            ch: List[float] = []
            for t in (chapters or []):
                try:
                    ft = float(t)
                    if ft >= 0:
                        ch.append(ft)
                except Exception:
                    continue
            self._chapters = ch
        except Exception:
            self._chapters = []
        try:
            self.update()
        except Exception:
            pass

    # ---- Internals ----

    def _groove_rect(self) -> QRect:
        opt = QStyleOptionSlider()
        self.initStyleOption(opt)
        groove = self.style().subControlRect(QStyle.CC_Slider, opt, QStyle.SC_SliderGroove, self)
        # Some styles return a very thin/short groove; still usable.
        return groove

    def _value_for_x(self, x: int) -> int:
        lo, hi = self.minimum(), self.maximum()
        groove = self._groove_rect()
        if hi <= lo:
            return lo
        if groove.width() <= 1:
            w = max(1, self.width())
            return QStyle.sliderValueFromPosition(lo, hi, x, w)
        # Map x relative to groove
        gx = int(x - groove.left())
        gx = max(0, min(groove.width(), gx))
        return QStyle.sliderValueFromPosition(lo, hi, gx, groove.width())

    def _fraction_for_value(self, val: int) -> float:
        try:
            lo, hi = self.minimum(), self.maximum()
            if hi <= lo:
                return 0.0
            frac = (float(val) - float(lo)) / float(hi - lo)
            return max(0.0, min(1.0, frac))
        except Exception:
            return 0.0

    def _show_bubble(self, x: int):
        try:
            if not self._duration or self._duration <= 0:
                self._bubble.hide()
                return
            val = self._value_for_x(x)
            frac = self._fraction_for_value(val)
            t = frac * float(self._duration)
            self._bubble.setText(_fmt_time(t))
            self._bubble.adjustSize()

            bx = int(x - self._bubble.width() / 2)
            bx = max(0, min(self.width() - self._bubble.width(), bx))
            by = -self._bubble.height() - 10
            self._bubble.move(bx, by)
            self._bubble.show()
        except Exception:
            self._bubble.hide()

    def _seek_from_x(self, x: int):
        """Update slider value from x and emit fraction."""
        val = self._value_for_x(x)
        self.setValue(val)
        try:
            self.seek_fraction_requested.emit(self._fraction_for_value(val))
        except Exception:
            pass

    # ---- Painting ----

    def paintEvent(self, event):
        super().paintEvent(event)
        try:
            if not self._duration or self._duration <= 0:
                return
            if not self._chapters:
                return

            groove = self._groove_rect()
            if groove.width() <= 2:
                return

            p = QPainter(self)
            p.setRenderHint(QPainter.RenderHint.Antialiasing, False)
            p.setPen(QPen(QColor(255, 255, 255, 140), 1))

            y0 = groove.center().y()
            tick = 4
            left = groove.left()
            w = groove.width()

            for t in self._chapters:
                try:
                    frac = float(t) / float(self._duration)
                except Exception:
                    continue
                if frac <= 0.0 or frac >= 1.0:
                    continue
                x = int(left + frac * w)
                p.drawLine(x, y0 - tick, x, y0 + tick)
            p.end()
        except Exception:
            return

    # ---- Mouse handling (scrub) ----

    def mousePressEvent(self, event):
        try:
            if event.button() == Qt.MouseButton.LeftButton:
                self._dragging = True
                try:
                    self.setSliderDown(True)
                except Exception:
                    pass
                x = event.position().toPoint().x()
                self._seek_from_x(x)
                try:
                    self._show_bubble(x)
                except Exception:
                    pass
                event.accept()
                return
        except Exception:
            pass
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        try:
            x = event.position().toPoint().x()
            if self._dragging and (event.buttons() & Qt.MouseButton.LeftButton):
                self._seek_from_x(x)
                self._show_bubble(x)
                event.accept()
                return
            # Hover bubble (no drag)
            self._show_bubble(x)
        except Exception:
            pass
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        try:
            if event.button() == Qt.MouseButton.LeftButton and self._dragging:
                self._dragging = False
                try:
                    self.setSliderDown(False)
                except Exception:
                    pass
                x = event.position().toPoint().x()
                self._seek_from_x(x)
                try:
                    self._show_bubble(x)
                except Exception:
                    pass

                # Keep player hotkeys working immediately after seeking.
                try:
                    wdw = self.window()
                    if wdw:
                        try:
                            wdw.activateWindow()
                            wdw.raise_()
                        except Exception:
                            pass
                        try:
                            wdw.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                        except Exception:
                            pass
                        try:
                            wdw.grabKeyboard()
                        except Exception:
                            pass
                        try:
                            if hasattr(wdw, 'render_host') and wdw.render_host:
                                wdw.render_host.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                        except Exception:
                            pass
                except Exception:
                    pass

                event.accept()
                return
        except Exception:
            pass
        super().mouseReleaseEvent(event)

    def leaveEvent(self, event):
        try:
            if not self._dragging:
                self._bubble.hide()
        except Exception:
            pass
        super().leaveEvent(event)


class TrackPopover(QFrame):
    """Small in-HUD popover for selecting audio/subtitle tracks (non-modal; does not block scrubbing)."""

    track_selected = Signal(int)

    def __init__(self, parent: QWidget, title: str = ""):
        super().__init__(parent)
        self._title = title
        self.setObjectName("TrackPopover")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet(
            """
            QFrame#TrackPopover {
                background: rgba(12, 12, 12, 0.92);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
            }
            QLabel {
                color: rgba(255, 255, 255, 0.92);
                font-size: 11px;
                padding: 0px;
            }
            QListWidget {
                background: transparent;
                border: none;
                color: rgba(255, 255, 255, 0.92);
            }
            QListWidget::item {
                padding: 8px 10px;
                border-radius: 8px;
            }
            QListWidget::item:selected {
                background: rgba(255, 255, 255, 0.12);
            }
            """
        )

        lay = QVBoxLayout(self)
        lay.setContentsMargins(10, 10, 10, 10)
        lay.setSpacing(6)

        self._hdr = QLabel(self._title)
        if self._title:
            lay.addWidget(self._hdr)

        self.list = QListWidget(self)
        self.list.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.list.setVerticalScrollMode(QListWidget.ScrollMode.ScrollPerPixel)
        self.list.itemClicked.connect(self._on_item_clicked)
        lay.addWidget(self.list)

        self.hide()

    def open_for_button(self, btn: QWidget, items: List[Tuple[str, int, bool]]):
        """Items: (label, id, selected)."""
        try:
            self.list.clear()
            selected_row = -1
            for i, (label, tid, selected) in enumerate(items):
                it = QListWidgetItem(label)
                it.setData(Qt.ItemDataRole.UserRole, int(tid))
                self.list.addItem(it)
                if selected:
                    selected_row = i

            if self.list.count() == 0:
                it = QListWidgetItem("(no tracks)")
                it.setFlags(Qt.ItemFlag.NoItemFlags)
                self.list.addItem(it)
                selected_row = -1

            if selected_row >= 0:
                self.list.setCurrentRow(selected_row)

            self.list.setMinimumWidth(260)
            self.list.setMaximumHeight(240)
            self.adjustSize()

            # Place above the chip if possible, otherwise below.
            g = btn.mapToGlobal(QPoint(0, 0))
            parent = self.parentWidget() or btn.window()
            if not parent:
                return
            p = parent.mapFromGlobal(g)

            x = int(p.x())
            y_above = int(p.y() - self.height() - 8)
            y_below = int(p.y() + btn.height() + 8)
            y = y_above if y_above >= 6 else y_below

            # Keep within stage bounds
            x = max(6, min(parent.width() - self.width() - 6, x))
            y = max(6, min(parent.height() - self.height() - 6, y))

            self.move(x, y)
            self.show()
            self.raise_()
        except Exception:
            pass

    def close_popover(self):
        try:
            self.hide()
        except Exception:
            pass

    def _on_item_clicked(self, item: QListWidgetItem):
        try:
            tid = int(item.data(Qt.ItemDataRole.UserRole))
            self.track_selected.emit(tid)
        except Exception:
            pass
        self.close_popover()


class PopoverDismissFilter(QObject):
    """Closes any open TrackPopover on outside clicks, without consuming the click."""

    def __init__(self, owner_window: QWidget):
        super().__init__(owner_window)
        self._w = owner_window

    def eventFilter(self, obj, event):
        try:
            if event.type() == QEvent.Type.MouseButtonPress:
                gp = event.globalPosition().toPoint() if hasattr(event, 'globalPosition') else QCursor.pos()
                try:
                    if hasattr(self._w, '_dismiss_popovers_for_global_click'):
                        self._w._dismiss_popovers_for_global_click(gp)
                except Exception:
                    pass
        except Exception:
            pass
        return False


class BottomHUDWidget(QWidget):
    """
    Bottom HUD - PotPlayer-style:
    - Thin seekbar strip with time + duration
    - Main row with transport on the left and utilities on the right
    """

    # Transport
    prev_clicked = Signal()
    play_pause_clicked = Signal()
    next_clicked = Signal()
    seek_requested = Signal(float)
    seek_step_requested = Signal(float)

    # Chips / actions (formerly top strip)
    back_clicked = Signal()
    tracks_clicked = Signal()
    speed_clicked = Signal()
    playlist_clicked = Signal()

    # Legacy signals kept for compatibility (no longer shown on the HUD bar)
    quality_clicked = Signal()
    info_clicked = Signal()

    # New: compact track pickers (popover menus, not full drawers)
    audio_track_clicked = Signal()
    subtitle_track_clicked = Signal()

    aspect_clicked = Signal()
    fullscreen_clicked = Signal()
    def __init__(self, parent=None):
        super().__init__(parent)

        self.setMouseTracking(True)

        self._chapters: List[float] = []

        root = QVBoxLayout(self)
        root.setContentsMargins(10, 6, 10, 6)
        root.setSpacing(4)

        # --- Seekbar strip ---
        seek_row = QHBoxLayout()
        seek_row.setContentsMargins(0, 0, 0, 0)
        seek_row.setSpacing(6)

        self.time_label = QLabel("0:00")
        self.time_label.setStyleSheet("color: white; font-size: 11px;")
        seek_row.addWidget(self.time_label)

        self.seek_back_10_btn = ChipButton("-10s")
        self.seek_back_10_btn.setToolTip("Back 10 seconds")
        self.seek_back_10_btn.setMinimumWidth(46)
        self.seek_back_10_btn.clicked.connect(lambda: self.seek_step_requested.emit(-10.0))
        seek_row.addWidget(self.seek_back_10_btn)

        self.scrub = SeekSlider(Qt.Orientation.Horizontal)
        self.scrub.setRange(0, 1000)
        self.scrub.setValue(0)
        self.scrub.setStyleSheet("""
            QSlider::groove:horizontal {
                height: 5px;
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(80, 80, 80, 0.9),
                    stop:1 rgba(30, 30, 30, 0.95));
                border: 1px solid rgba(0, 0, 0, 0.7);
                border-radius: 2px;
            }
            QSlider::sub-page:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(210, 210, 210, 0.95),
                    stop:1 rgba(140, 140, 140, 0.95));
                border-radius: 2px;
            }
            QSlider::add-page:horizontal {
                background: rgba(20, 20, 20, 0.9);
                border-radius: 2px;
            }
            QSlider::handle:horizontal {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(230, 230, 230, 0.98),
                    stop:1 rgba(150, 150, 150, 0.98));
                width: 12px;
                margin: -5px 0;
                border: 1px solid rgba(0, 0, 0, 0.7);
                border-radius: 2px;
            }
        """)
        self.scrub.seek_fraction_requested.connect(self.seek_requested)
        seek_row.addWidget(self.scrub, stretch=1)

        self.seek_forward_10_btn = ChipButton("+10s")
        self.seek_forward_10_btn.setToolTip("Forward 10 seconds")
        self.seek_forward_10_btn.setMinimumWidth(46)
        self.seek_forward_10_btn.clicked.connect(lambda: self.seek_step_requested.emit(10.0))
        seek_row.addWidget(self.seek_forward_10_btn)

        self.duration_label = QLabel("0:00")
        self.duration_label.setStyleSheet("color: white; font-size: 11px;")
        seek_row.addWidget(self.duration_label)

        root.addLayout(seek_row)

        # --- Main row: transport left + title + utility right ---
        main_row = QHBoxLayout()
        main_row.setContentsMargins(0, 0, 0, 0)
        main_row.setSpacing(8)

        self.back_btn = QPushButton("←")
        self.back_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(72, 72, 72, 0.95),
                    stop:0.5 rgba(44, 44, 44, 0.98),
                    stop:1 rgba(28, 28, 28, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.75);
                border-top-color: rgba(120, 120, 120, 0.7);
                border-bottom-color: rgba(0, 0, 0, 0.85);
                border-radius: 3px;
                padding: 4px 10px;
                color: rgba(245, 245, 245, 0.98);
                font-size: 14px;
                font-weight: 600;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(96, 96, 96, 0.98),
                    stop:0.5 rgba(58, 58, 58, 0.98),
                    stop:1 rgba(34, 34, 34, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(24, 24, 24, 0.98),
                    stop:0.6 rgba(46, 46, 46, 0.98),
                    stop:1 rgba(70, 70, 70, 0.98));
                border-top-color: rgba(0, 0, 0, 0.9);
                border-bottom-color: rgba(120, 120, 120, 0.4);
            }
        """)
        self.back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.back_btn.clicked.connect(self.back_clicked)
        main_row.addWidget(self.back_btn)

        transport_row = QHBoxLayout()
        transport_row.setContentsMargins(0, 0, 0, 0)
        transport_row.setSpacing(6)

        self.prev_btn = QPushButton("⏮\ufe0e")
        self.prev_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(80, 80, 80, 0.95),
                    stop:0.5 rgba(52, 52, 52, 0.98),
                    stop:1 rgba(30, 30, 30, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.8);
                border-top-color: rgba(130, 130, 130, 0.7);
                border-bottom-color: rgba(0, 0, 0, 0.9);
                border-radius: 3px;
                padding: 2px 8px;
                color: rgba(245, 245, 245, 0.95);
                font-size: 18px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(100, 100, 100, 0.98),
                    stop:0.5 rgba(62, 62, 62, 0.98),
                    stop:1 rgba(36, 36, 36, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(26, 26, 26, 0.98),
                    stop:0.6 rgba(52, 52, 52, 0.98),
                    stop:1 rgba(82, 82, 82, 0.98));
                border-top-color: rgba(0, 0, 0, 0.9);
                border-bottom-color: rgba(140, 140, 140, 0.35);
            }
        """)
        self.prev_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.prev_btn.clicked.connect(self.prev_clicked)
        transport_row.addWidget(self.prev_btn)

        self.play_pause_btn = QPushButton("▶")
        self.play_pause_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(96, 96, 96, 0.98),
                    stop:0.5 rgba(66, 66, 66, 0.98),
                    stop:1 rgba(36, 36, 36, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.85);
                border-top-color: rgba(150, 150, 150, 0.7);
                border-bottom-color: rgba(0, 0, 0, 0.95);
                border-radius: 3px;
                padding: 2px 10px;
                color: rgba(255, 255, 255, 0.98);
                font-size: 20px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(120, 120, 120, 0.98),
                    stop:0.5 rgba(78, 78, 78, 0.98),
                    stop:1 rgba(40, 40, 40, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(30, 30, 30, 0.98),
                    stop:0.6 rgba(60, 60, 60, 0.98),
                    stop:1 rgba(96, 96, 96, 0.98));
                border-top-color: rgba(0, 0, 0, 0.95);
                border-bottom-color: rgba(160, 160, 160, 0.35);
            }
        """)
        self.play_pause_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.play_pause_btn.clicked.connect(self.play_pause_clicked)
        transport_row.addWidget(self.play_pause_btn)

        self.next_btn = QPushButton("⏭\ufe0e")
        self.next_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(80, 80, 80, 0.95),
                    stop:0.5 rgba(52, 52, 52, 0.98),
                    stop:1 rgba(30, 30, 30, 0.98));
                border: 1px solid rgba(0, 0, 0, 0.8);
                border-top-color: rgba(130, 130, 130, 0.7);
                border-bottom-color: rgba(0, 0, 0, 0.9);
                border-radius: 3px;
                padding: 2px 8px;
                color: rgba(245, 245, 245, 0.95);
                font-size: 18px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(100, 100, 100, 0.98),
                    stop:0.5 rgba(62, 62, 62, 0.98),
                    stop:1 rgba(36, 36, 36, 0.98));
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(26, 26, 26, 0.98),
                    stop:0.6 rgba(52, 52, 52, 0.98),
                    stop:1 rgba(82, 82, 82, 0.98));
                border-top-color: rgba(0, 0, 0, 0.9);
                border-bottom-color: rgba(140, 140, 140, 0.35);
            }
        """)
        self.next_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.next_btn.clicked.connect(self.next_clicked)
        transport_row.addWidget(self.next_btn)

        main_row.addLayout(transport_row)

        self.title_label = QLabel("")
        self.title_label.setStyleSheet("color: rgba(255, 255, 255, 0.90); font-size: 12px; font-weight: 500;")
        self.title_label.setMinimumWidth(120)
        self.title_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        main_row.addWidget(self.title_label)

        right_row = QHBoxLayout()
        right_row.setContentsMargins(0, 0, 0, 0)
        right_row.setSpacing(6)

        self.tracks_btn = ChipButton("♫")
        self.tracks_btn.setToolTip("Tracks")
        self.tracks_btn.clicked.connect(self.tracks_clicked)
        right_row.addWidget(self.tracks_btn)

        self.speed_btn = ChipButton("1.0×")
        self.speed_btn.setToolTip("Speed")
        self.speed_btn.clicked.connect(self.speed_clicked)
        right_row.addWidget(self.speed_btn)

        self.audio_btn = ChipButton("♪")
        self.audio_btn.setToolTip("Audio Track")
        self.audio_btn.clicked.connect(self.audio_track_clicked)
        right_row.addWidget(self.audio_btn)

        self.aspect_btn = ChipButton("▭")
        self.aspect_btn.setToolTip("Aspect")
        self.aspect_btn.clicked.connect(self.aspect_clicked)
        right_row.addWidget(self.aspect_btn)

        self.playlist_btn = ChipButton("☰")
        self.playlist_btn.setToolTip("Playlist")
        self.playlist_btn.clicked.connect(self.playlist_clicked)
        right_row.addWidget(self.playlist_btn)

        self.subtitle_btn = ChipButton("CC")
        self.subtitle_btn.setToolTip("Subtitle Track")
        self.subtitle_btn.clicked.connect(self.subtitle_track_clicked)
        right_row.addWidget(self.subtitle_btn)

        self.fullscreen_btn = ChipButton("⤢")
        self.fullscreen_btn.setToolTip("Fullscreen")
        self.fullscreen_btn.clicked.connect(self.fullscreen_clicked)
        right_row.addWidget(self.fullscreen_btn)

        main_row.addLayout(right_row)

        root.addLayout(main_row)

        self.setStyleSheet(
            "background: rgba(10, 10, 10, 0.35);"
            "border-top: 1px solid rgba(255, 255, 255, 0.06);"
        )

    def set_title(self, title: str):
        self.title_label.setText(title)

    def set_speed_label(self, speed: float):
        self.speed_btn.setText(f"{speed:.1f}×")


    def set_quality_label(self, mode: str):
        """Legacy: keep method for compatibility, but no HUD chip is shown in this build."""
        try:
            btn = getattr(self, "quality_btn", None)
            if not btn:
                return
            m = str(mode).strip().lower()
            if 'high' in m:
                btn.setText('▮▮▮')
            elif 'low' in m:
                btn.setText('▮')
            else:
                btn.setText('▮▮')
        except Exception:
            pass

    def set_chapters(self, chapters: Optional[List[float]]):
        try:
            self._chapters = list(chapters or [])
        except Exception:
            self._chapters = []
        try:
            self.scrub.set_chapters(self._chapters)
        except Exception:
            pass

    def update_scrubber(self, pos: Optional[float], dur: Optional[float]):
        try:
            if self.scrub.isSliderDown():
                return
            if dur and dur > 0 and pos is not None:
                frac = max(0.0, min(1.0, pos / dur))
                self.scrub.set_duration(dur)
                try:
                    self.scrub.set_chapters(getattr(self, '_chapters', []))
                except Exception:
                    pass
                self.scrub.blockSignals(True)
                self.scrub.setValue(int(frac * 1000))
                self.scrub.blockSignals(False)
        except Exception:
            pass

    def update_time_labels(self, pos: Optional[float], dur: Optional[float]):
        try:
            self.time_label.setText(_fmt_time(pos))
            self.duration_label.setText(_fmt_time(dur))
        except Exception:
            pass

    def set_play_pause_icon(self, is_playing: bool):
        self.play_pause_btn.setText("⏸" if is_playing else "▶")

    def enterEvent(self, event):
        try:
            w = self.window()
            if w and hasattr(w, "_arm_controls_autohide"):
                if getattr(w, "_controls_visible", False):
                    w._arm_controls_autohide()
        except Exception:
            pass
        try:
            return super().enterEvent(event)
        except Exception:
            pass

    def mouseMoveEvent(self, event):
        try:
            w = self.window()
            if w and hasattr(w, "_arm_controls_autohide"):
                if getattr(w, "_controls_visible", False):
                    w._arm_controls_autohide()
        except Exception:
            pass
        try:
            return super().mouseMoveEvent(event)
        except Exception:
            pass


class CenterFlashWidget(QWidget):
    """Center flash feedback for play/pause."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        
        self.label = QLabel("▶", self)
        self.label.setStyleSheet("""
            font-size: 80px;
            color: white;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 50px;
            padding: 20px;
        """)
        self.label.adjustSize()
        
        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(0.0)
        
        self.fade_anim = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        
        self.hide()
    
    def flash(self, icon: str):
        try:
            self.label.setText(icon)
            self.label.adjustSize()
            
            parent = self.parent()
            if parent:
                self.resize(self.label.size())
                x = (parent.width() - self.width()) // 2
                y = (parent.height() - self.height()) // 2
                self.move(x, y)
            
            self.show()
            self.fade_anim.stop()
            self.fade_anim.setDuration(300)
            self.fade_anim.setStartValue(0.0)
            self.fade_anim.setEndValue(1.0)
            self.fade_anim.start()
            
            QTimer.singleShot(500, self._fade_out)
        except Exception:
            pass
    
    def _fade_out(self):
        try:
            self.fade_anim.stop()
            self.fade_anim.setDuration(300)
            self.fade_anim.setStartValue(self.opacity_effect.opacity())
            self.fade_anim.setEndValue(0.0)
            self.fade_anim.finished.connect(self.hide)
            self.fade_anim.start()
        except Exception:
            pass


class TracksPanel(QDialog):
    """Build 13 Tracks Panel - Real track selector."""
    
    audio_selected = Signal(int)
    subtitle_selected = Signal(int)
    load_subtitle_requested = Signal()
    audio_delay_changed = Signal(float)
    subtitle_delay_changed = Signal(float)
    aspect_changed = Signal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Tracks")
        self.setModal(False)
        self.setMinimumWidth(400)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        
        # Audio section
        audio_group = QWidget()
        audio_layout = QVBoxLayout(audio_group)
        audio_layout.setSpacing(8)
        
        audio_label = QLabel("Audio Track:")
        audio_label.setStyleSheet("font-weight: bold; font-size: 13px;")
        audio_layout.addWidget(audio_label)
        
        self.audio_list = QListWidget()
        self.audio_list.setMaximumHeight(120)
        self.audio_list.itemClicked.connect(self._on_audio_clicked)
        audio_layout.addWidget(self.audio_list)
        
        audio_delay_layout = QHBoxLayout()
        audio_delay_layout.addWidget(QLabel("Audio Delay (s):"))
        self.audio_delay_spin = QDoubleSpinBox()
        self.audio_delay_spin.setRange(-10.0, 10.0)
        self.audio_delay_spin.setSingleStep(0.1)
        self.audio_delay_spin.setValue(0.0)
        self.audio_delay_spin.valueChanged.connect(lambda v: self.audio_delay_changed.emit(v))
        audio_delay_layout.addWidget(self.audio_delay_spin)
        audio_delay_layout.addStretch()
        audio_layout.addLayout(audio_delay_layout)
        
        layout.addWidget(audio_group)
        
        # Subtitle section
        subtitle_group = QWidget()
        subtitle_layout = QVBoxLayout(subtitle_group)
        subtitle_layout.setSpacing(8)
        
        subtitle_label = QLabel("Subtitle Track:")
        subtitle_label.setStyleSheet("font-weight: bold; font-size: 13px;")
        subtitle_layout.addWidget(subtitle_label)
        
        self.subtitle_list = QListWidget()
        self.subtitle_list.setMaximumHeight(120)
        self.subtitle_list.itemClicked.connect(self._on_subtitle_clicked)
        subtitle_layout.addWidget(self.subtitle_list)
        
        subtitle_delay_layout = QHBoxLayout()
        subtitle_delay_layout.addWidget(QLabel("Subtitle Delay (s):"))
        self.subtitle_delay_spin = QDoubleSpinBox()
        self.subtitle_delay_spin.setRange(-10.0, 10.0)
        self.subtitle_delay_spin.setSingleStep(0.1)
        self.subtitle_delay_spin.setValue(0.0)
        self.subtitle_delay_spin.valueChanged.connect(lambda v: self.subtitle_delay_changed.emit(v))
        subtitle_delay_layout.addWidget(self.subtitle_delay_spin)
        subtitle_delay_layout.addStretch()
        subtitle_layout.addLayout(subtitle_delay_layout)
        
        load_sub_btn = QPushButton("⤓")
        load_sub_btn.setToolTip("Load external subtitle")
        load_sub_btn.clicked.connect(self.load_subtitle_requested)
        subtitle_layout.addWidget(load_sub_btn)
        
        layout.addWidget(subtitle_group)
        
        # Aspect ratio section
        aspect_group = QWidget()
        aspect_layout = QVBoxLayout(aspect_group)
        aspect_layout.setSpacing(8)
        
        aspect_label = QLabel("Aspect Ratio:")
        aspect_label.setStyleSheet("font-weight: bold; font-size: 13px;")
        aspect_layout.addWidget(aspect_label)
        
        aspect_buttons_layout = QHBoxLayout()
        self.aspect_group = QButtonGroup()
        
        for idx, (label, value) in enumerate([
            ("⟲", ""),
            ("16:9", "16:9"),
            ("4:3", "4:3"),
            ("2.35:1", "2.35:1"),
        ]):
            btn = QRadioButton(label)
            btn.setProperty("aspect_value", value)
            self.aspect_group.addButton(btn, idx)
            aspect_buttons_layout.addWidget(btn)
            if label == "Auto":
                btn.setChecked(True)
        
        self.aspect_group.buttonClicked.connect(self._on_aspect_clicked)
        aspect_layout.addLayout(aspect_buttons_layout)
        
        layout.addWidget(aspect_group)
        
        close_btn = QPushButton("✕")
        close_btn.clicked.connect(self.hide)
        layout.addWidget(close_btn)
        
        self.setStyleSheet("""
            QDialog { background: #2b2b2b; color: white; }
            QLabel { color: white; }
            QPushButton {
                background: #3a3a3a;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 6px 12px;
                color: white;
            }
            QPushButton:hover { background: #4a4a4a; }
            QListWidget {
                background: #1e1e1e;
                border: 1px solid #555;
                color: white;
            }
            QListWidget::item:selected {
                background: #666666;
            }
            QDoubleSpinBox {
                background: #1e1e1e;
                border: 1px solid #555;
                color: white;
                padding: 4px;
            }
            QRadioButton { color: white; }
        """)
    
    def populate_audio_tracks(self, tracks: List[Dict]):
        try:
            self.audio_list.clear()
            for track in tracks:
                label = f"Track {track['id']}: {track.get('lang', 'und')}"
                if track.get('title'):
                    label += f" - {track['title']}"
                item = QListWidgetItem(label)
                item.setData(Qt.ItemDataRole.UserRole, track['id'])
                self.audio_list.addItem(item)
                if track.get('selected'):
                    item.setSelected(True)
        except Exception as e:
            print(f"TracksPanel populate_audio_tracks error: {e}")
    
    def populate_subtitle_tracks(self, tracks: List[Dict]):
        try:
            self.subtitle_list.clear()
            
            none_item = QListWidgetItem("None")
            none_item.setData(Qt.ItemDataRole.UserRole, -1)
            self.subtitle_list.addItem(none_item)
            
            for track in tracks:
                label = f"Track {track['id']}: {track.get('lang', 'und')}"
                if track.get('title'):
                    label += f" - {track['title']}"
                item = QListWidgetItem(label)
                item.setData(Qt.ItemDataRole.UserRole, track['id'])
                self.subtitle_list.addItem(item)
                if track.get('selected'):
                    item.setSelected(True)
            
            if not any(track.get('selected') for track in tracks):
                none_item.setSelected(True)
        except Exception as e:
            print(f"TracksPanel populate_subtitle_tracks error: {e}")
    
    def _on_audio_clicked(self, item):
        try:
            track_id = item.data(Qt.ItemDataRole.UserRole)
            self.audio_selected.emit(track_id)
        except Exception:
            pass
    
    def _on_subtitle_clicked(self, item):
        try:
            track_id = item.data(Qt.ItemDataRole.UserRole)
            self.subtitle_selected.emit(track_id)
        except Exception:
            pass
    
    def _on_aspect_clicked(self, button):
        try:
            value = button.property("aspect_value")
            self.aspect_changed.emit(value if value else "-1")
        except Exception:
            pass


class PlaylistPanel(QDialog):
    """Build 13 Playlist Panel - Folder-scoped playlist."""
    
    episode_selected = Signal(int)
    folder_changed = Signal(str)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Playlist")
        self.setModal(False)
        self.setMinimumSize(500, 400)
        
        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        
        self.folder_label = QLabel("Current Folder: ")
        self.folder_label.setStyleSheet("font-weight: bold; font-size: 13px; color: white;")
        self.folder_label.setWordWrap(True)
        layout.addWidget(self.folder_label)
        
        self.episode_list = QListWidget()
        self.episode_list.itemDoubleClicked.connect(self._on_episode_double_clicked)
        layout.addWidget(self.episode_list)
        
        nav_layout = QHBoxLayout()
        
        self.prev_btn = QPushButton("⏮ Previous Episode")
        self.prev_btn.clicked.connect(lambda: self._navigate_episode(-1))
        nav_layout.addWidget(self.prev_btn)
        
        self.next_btn = QPushButton("Next Episode ⏭")
        self.next_btn.clicked.connect(lambda: self._navigate_episode(1))
        nav_layout.addWidget(self.next_btn)
        
        layout.addLayout(nav_layout)
        
        close_btn = QPushButton("✕")
        close_btn.clicked.connect(self.hide)
        layout.addWidget(close_btn)
        
        self.setStyleSheet("""
            QDialog { background: #2b2b2b; color: white; }
            QLabel { color: white; }
            QPushButton {
                background: #3a3a3a;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 8px 16px;
                color: white;
            }
            QPushButton:hover { background: #4a4a4a; }
            QPushButton:disabled {
                background: #222;
                color: #666;
            }
            QListWidget {
                background: #1e1e1e;
                border: 1px solid #555;
                color: white;
                font-size: 13px;
            }
            QListWidget::item {
                padding: 6px;
            }
            QListWidget::item:selected {
                background: #666666;
            }
        """)
        
        self._current_index = -1
        self._playlist_data = []
    
    def populate_playlist(self, folder_path: str, episodes: List[Dict], current_index: int):
        try:
            self._playlist_data = episodes
            self._current_index = current_index
            
            self.folder_label.setText(f"Current Folder: {folder_path}")
            
            self.episode_list.clear()
            for idx, ep in enumerate(episodes):
                name = ep.get('name', Path(ep['path']).name)
                prefix = "▶ " if idx == current_index else "   "
                item = QListWidgetItem(f"{prefix}{name}")
                item.setData(Qt.ItemDataRole.UserRole, idx)
                self.episode_list.addItem(item)
                if idx == current_index:
                    item.setSelected(True)
            
            self.prev_btn.setEnabled(current_index > 0)
            self.next_btn.setEnabled(current_index < len(episodes) - 1)
        except Exception as e:
            print(f"PlaylistPanel populate_playlist error: {e}")
    
    def _on_episode_double_clicked(self, item):
        try:
            idx = item.data(Qt.ItemDataRole.UserRole)
            self.episode_selected.emit(idx)
        except Exception:
            pass
    
    def _navigate_episode(self, direction: int):
        try:
            new_index = self._current_index + direction
            if 0 <= new_index < len(self._playlist_data):
                self.episode_selected.emit(new_index)
        except Exception:
            pass


class DiagnosticsOverlay(QWidget):
    """Build 13 Diagnostics Overlay - Toggleable info display."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet("""
            background: rgba(0, 0, 0, 0.72);
            color: rgba(255, 255, 255, 0.92);
            font-family: "Consolas", "Menlo", "Courier New", monospace;
            font-size: 11px;
            border: 1px solid rgba(255, 255, 255, 0.28);
            border-radius: 3px;
            padding: 8px;
        """)
        
        self.label = QLabel(self)
        self.label.setStyleSheet(
            "color: rgba(255, 255, 255, 0.92); background: transparent; border: none;"
        )
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.addWidget(self.label)
        
        self.hide()
    
    def update_diagnostics(self, info: Dict[str, Any]):
        try:
            lines = []
            for key, value in info.items():
                lines.append(f"{key}: {value}")
            self.label.setText("\n".join(lines))
            self.adjustSize()
        except Exception:
            pass


class ToastHUD(QWidget):
    """Small fading toast used for embedded-style feedback."""

    def __init__(self, parent: QWidget):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)

        self._label = QLabel("", self)
        self._label.setStyleSheet(
            """
            QLabel {
                background: rgba(0, 0, 0, 0.68);
                color: rgba(255, 255, 255, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 3px;
                padding: 6px 10px;
                font-size: 12px;
                font-family: "Segoe UI", "Tahoma", "Arial", sans-serif;
                letter-spacing: 0.2px;
            }
            """
        )

        self._opacity = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self._opacity)
        self._opacity.setOpacity(0.0)

        self._anim = QPropertyAnimation(self._opacity, b"opacity")
        self._anim.setEasingCurve(QEasingCurve.Type.InOutQuad)

        self._hide_timer = QTimer(self)
        self._hide_timer.setSingleShot(True)
        self._hide_timer.timeout.connect(self._fade_out)

        self.hide()

    def show_toast(self, text: str, ms: int = 1200):
        try:
            self._label.setText(text)
            self._label.adjustSize()
            self.resize(self._label.size())

            p = self.parent()
            if p:
                margin = 18
                x = margin
                y = margin
                self.move(x, y)

            self.show()
            self.raise_()
            self._anim.stop()
            self._anim.setDuration(150)
            self._anim.setStartValue(self._opacity.opacity())
            self._anim.setEndValue(1.0)
            self._anim.start()

            self._hide_timer.stop()
            self._hide_timer.start(ms)
        except Exception:
            pass

    def _fade_out(self):
        try:
            self._anim.stop()
            self._anim.setDuration(220)
            self._anim.setStartValue(self._opacity.opacity())
            self._anim.setEndValue(0.0)
            self._anim.finished.connect(self.hide)
            self._anim.start()
        except Exception:
            pass


class SlideDrawer(QFrame):
    """Stage-anchored slide-in drawer (left or right)."""

    def __init__(self, side: str, parent: QWidget):
        super().__init__(parent)
        self._side = side  # 'left' or 'right'
        self._open = False
        self._w = 420
        self._top = 50
        self._bottom = 50

        self.setObjectName("SlideDrawer")
        self.setStyleSheet(
            """
            QFrame#SlideDrawer {
                background: rgba(12, 12, 12, 0.55);
                border: 1px solid rgba(255, 255, 255, 0.10);
                border-radius: 14px;
            }
            QLabel { color: rgba(255, 255, 255, 0.92); }
            QPushButton {
                background: rgba(255, 255, 255, 0.10);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 10px;
                padding: 6px 10px;
                color: rgba(255, 255, 255, 0.92);
            }
            QPushButton:hover { background: rgba(255, 255, 255, 0.16); }
            QListWidget {
                background: rgba(0, 0, 0, 0.22);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                color: rgba(255, 255, 255, 0.92);
            }
            QListWidget::item:selected { background: rgba(255, 255, 255, 0.12); }
            QDoubleSpinBox, QSpinBox {
                background: rgba(0, 0, 0, 0.22);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.92);
                padding: 4px 6px;
            }
            QCheckBox { color: rgba(255, 255, 255, 0.92); }
            QRadioButton { color: rgba(255, 255, 255, 0.92); }
            """
        )

        self._anim = QPropertyAnimation(self, b"geometry")
        self._anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self._anim.setDuration(180)

        self.hide()

    def configure(self, width: int, top: int, bottom: int):
        self._w = int(width)
        self._top = int(top)
        self._bottom = int(bottom)

    def update_stage_geometry(self, stage_w: int, stage_h: int):
        h = max(100, int(stage_h - self._top - self._bottom))
        y = int(self._top)
        if self._side == 'left':
            x_open = 0
            x_closed = -self._w
        else:
            x_open = int(stage_w - self._w)
            x_closed = int(stage_w)

        x = x_open if self._open else x_closed
        self.setGeometry(x, y, self._w, h)

    def is_open(self) -> bool:
        return self._open

    def open(self, stage_w: int):
        self._open = True
        self.show()
        self.raise_()
        g = self.geometry()
        if self._side == 'left':
            end = QRect(0, g.y(), self._w, g.height())
        else:
            end = QRect(stage_w - self._w, g.y(), self._w, g.height())
        self._animate_to(end)

    def close(self, stage_w: int):
        self._open = False
        g = self.geometry()
        if self._side == 'left':
            end = QRect(-self._w, g.y(), self._w, g.height())
        else:
            end = QRect(stage_w, g.y(), self._w, g.height())

        def _after():
            try:
                if not self._open:
                    self.hide()
            except Exception:
                pass

        self._animate_to(end, finished_cb=_after)

    def toggle(self, stage_w: int):
        if self._open:
            self.close(stage_w)
        else:
            self.open(stage_w)

    def _animate_to(self, end_rect: QRect, finished_cb=None):
        """Move drawer without sliding animation.

        On Windows, mpv renders into a native child window. Geometry animations over a native surface
        can leave ghost trails because the underlying surface may not repaint between frames (especially
        while paused). We snap to the final geometry and force a stage repaint.
        """
        try:
            # Stop any previous animation and disconnect accumulated callbacks.
            try:
                if getattr(self, "_anim", None):
                    self._anim.stop()
                    try:
                        self._anim.finished.disconnect()
                    except Exception:
                        pass
            except Exception:
                pass

            self.setGeometry(end_rect)

            # Force repaint of the stage so the mpv surface doesn't leave artifacts.
            try:
                p = self.parent()
                if p:
                    p.update()
                    p.repaint()
            except Exception:
                pass

            if finished_cb:
                finished_cb()
        except Exception:
            try:
                self.setGeometry(end_rect)
            except Exception:
                pass
            try:
                if finished_cb:
                    finished_cb()
            except Exception:
                pass

class TracksDrawer(SlideDrawer):
    """Embedded-style tracks drawer (right side)."""

    audio_selected = Signal(int)
    subtitle_selected = Signal(int)
    load_subtitle_requested = Signal()
    audio_delay_changed = Signal(float)
    subtitle_delay_changed = Signal(float)
    aspect_changed = Signal(str)
    subtitle_style_respect_changed = Signal(bool)
    subtitle_hud_lift_changed = Signal(int)

    def __init__(self, parent: QWidget):
        super().__init__('right', parent)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(10)

        title = QLabel("Tracks")
        title.setStyleSheet("font-size: 14px; font-weight: 600;")
        layout.addWidget(title)

        # Audio
        layout.addWidget(QLabel("Audio"))
        self.audio_list = QListWidget()
        self.audio_list.setMaximumHeight(140)
        self.audio_list.itemClicked.connect(self._on_audio_clicked)
        layout.addWidget(self.audio_list)

        ad = QHBoxLayout()
        self.audio_delay_label = QLabel("Audio delay")
        ad.addWidget(self.audio_delay_label)
        self.audio_delay_spin = QDoubleSpinBox()
        self.audio_delay_spin.setRange(-10.0, 10.0)
        self.audio_delay_spin.setSingleStep(0.1)
        self.audio_delay_spin.valueChanged.connect(lambda v: self.audio_delay_changed.emit(float(v)))
        ad.addWidget(self.audio_delay_spin)
        ad.addStretch()
        layout.addLayout(ad)

        # Build 20: simplify controls (hide delays from user-facing UI)
        try:
            self.audio_delay_label.setVisible(False)
            self.audio_delay_spin.setVisible(False)
        except Exception:
            pass

        layout.addSpacing(6)

        # Subs
        layout.addWidget(QLabel("Subtitles"))
        self.subtitle_list = QListWidget()
        self.subtitle_list.setMaximumHeight(150)
        self.subtitle_list.itemClicked.connect(self._on_subtitle_clicked)
        layout.addWidget(self.subtitle_list)

        sd = QHBoxLayout()
        self.subtitle_delay_label = QLabel("Subtitle delay")
        sd.addWidget(self.subtitle_delay_label)
        self.subtitle_delay_spin = QDoubleSpinBox()
        self.subtitle_delay_spin.setRange(-10.0, 10.0)
        self.subtitle_delay_spin.setSingleStep(0.1)
        self.subtitle_delay_spin.valueChanged.connect(lambda v: self.subtitle_delay_changed.emit(float(v)))
        sd.addWidget(self.subtitle_delay_spin)
        sd.addStretch()
        layout.addLayout(sd)

        # Build 20: simplify controls (hide delays from user-facing UI)
        try:
            self.subtitle_delay_label.setVisible(False)
            self.subtitle_delay_spin.setVisible(False)
        except Exception:
            pass

        self.respect_styles = QCheckBox("Respect embedded subtitle styles")
        self.respect_styles.setChecked(True)
        self.respect_styles.stateChanged.connect(lambda s: self.subtitle_style_respect_changed.emit(bool(s)))
        layout.addWidget(self.respect_styles)

        shl = QHBoxLayout()
        self.subtitle_hud_lift_label = QLabel("Subtitle HUD lift")
        shl.addWidget(self.subtitle_hud_lift_label)
        self.subtitle_hud_lift_dec_btn = QPushButton("-")
        self.subtitle_hud_lift_dec_btn.setFixedWidth(26)
        shl.addWidget(self.subtitle_hud_lift_dec_btn)
        self.subtitle_hud_lift_spin = QSpinBox()
        self.subtitle_hud_lift_spin.setRange(0, 300)
        self.subtitle_hud_lift_spin.setSingleStep(4)
        self.subtitle_hud_lift_spin.setSuffix(" px")
        self.subtitle_hud_lift_spin.setValue(40)
        self.subtitle_hud_lift_spin.valueChanged.connect(lambda v: self.subtitle_hud_lift_changed.emit(int(v)))
        shl.addWidget(self.subtitle_hud_lift_spin)
        self.subtitle_hud_lift_inc_btn = QPushButton("+")
        self.subtitle_hud_lift_inc_btn.setFixedWidth(26)
        shl.addWidget(self.subtitle_hud_lift_inc_btn)
        self.subtitle_hud_lift_dec_btn.clicked.connect(
            lambda: self.subtitle_hud_lift_spin.setValue(self.subtitle_hud_lift_spin.value() - self.subtitle_hud_lift_spin.singleStep())
        )
        self.subtitle_hud_lift_inc_btn.clicked.connect(
            lambda: self.subtitle_hud_lift_spin.setValue(self.subtitle_hud_lift_spin.value() + self.subtitle_hud_lift_spin.singleStep())
        )
        shl.addStretch()
        layout.addLayout(shl)

        load_sub_btn = QPushButton("⤓")
        load_sub_btn.setToolTip("Load external subtitle")
        load_sub_btn.clicked.connect(self.load_subtitle_requested)
        layout.addWidget(load_sub_btn)

        layout.addSpacing(6)

        # Aspect ratio (kept under the hood, hidden from UI in Build 20)
        self.aspect_label = QLabel("▭")
        layout.addWidget(self.aspect_label)
        aspect_row = QHBoxLayout()
        self._aspect_group = QButtonGroup(self)
        self._aspect_buttons = []
        for idx, (label, value) in enumerate([
            ("⟲", "-1"),
            ("16:9", "16:9"),
            ("4:3", "4:3"),
            ("2.35:1", "2.35:1"),
        ]):
            rb = QRadioButton(label)
            rb.setProperty("aspect_value", value)
            if idx == 0:
                rb.setChecked(True)
            self._aspect_group.addButton(rb, idx)
            self._aspect_buttons.append(rb)
            aspect_row.addWidget(rb)
        self._aspect_group.buttonClicked.connect(self._on_aspect_clicked)
        layout.addLayout(aspect_row)

        # Aspect ratio controls visible
        try:
            self.aspect_label.setVisible(True)
            for b in self._aspect_buttons:
                b.setVisible(True)
        except Exception:
            pass

        layout.addStretch(1)

        close_btn = QPushButton("✕")
        close_btn.clicked.connect(lambda: self.close(self.parent().width() if self.parent() else 1200))
        layout.addWidget(close_btn)

    def populate_audio_tracks(self, tracks: List[Dict]):
        try:
            self.audio_list.clear()
            for track in tracks:
                label = f"Track {track['id']}: {track.get('lang', 'und')}"
                if track.get('title'):
                    label += f" - {track['title']}"
                item = QListWidgetItem(label)
                item.setData(Qt.ItemDataRole.UserRole, track['id'])
                self.audio_list.addItem(item)
                if track.get('selected'):
                    item.setSelected(True)
        except Exception as e:
            print(f"TracksDrawer populate_audio_tracks error: {e}")

    def populate_subtitle_tracks(self, tracks: List[Dict]):
        try:
            self.subtitle_list.clear()
            none_item = QListWidgetItem("None")
            none_item.setData(Qt.ItemDataRole.UserRole, -1)
            self.subtitle_list.addItem(none_item)

            any_selected = False
            for track in tracks:
                label = f"Track {track['id']}: {track.get('lang', 'und')}"
                if track.get('title'):
                    label += f" - {track['title']}"
                item = QListWidgetItem(label)
                item.setData(Qt.ItemDataRole.UserRole, track['id'])
                self.subtitle_list.addItem(item)
                if track.get('selected'):
                    item.setSelected(True)
                    any_selected = True
            if not any_selected:
                none_item.setSelected(True)
        except Exception as e:
            print(f"TracksDrawer populate_subtitle_tracks error: {e}")

    def _on_audio_clicked(self, item):
        try:
            self.audio_selected.emit(int(item.data(Qt.ItemDataRole.UserRole)))
        except Exception:
            pass

    def _on_subtitle_clicked(self, item):
        try:
            self.subtitle_selected.emit(int(item.data(Qt.ItemDataRole.UserRole)))
        except Exception:
            pass

    def _on_aspect_clicked(self, button):
        try:
            val = button.property("aspect_value")
            self.aspect_changed.emit(str(val))
        except Exception:
            pass

    def set_subtitle_hud_lift_value(self, px: int):
        try:
            v = int(px)
        except Exception:
            v = 40
        v = max(0, min(300, v))
        try:
            self.subtitle_hud_lift_spin.blockSignals(True)
            self.subtitle_hud_lift_spin.setValue(v)
        except Exception:
            pass
        finally:
            try:
                self.subtitle_hud_lift_spin.blockSignals(False)
            except Exception:
                pass


class PlaylistDrawer(SlideDrawer):
    """Embedded-style playlist drawer (right side)."""

    episode_selected = Signal(int)
    auto_advance_changed = Signal(bool)

    def __init__(self, parent: QWidget):
        super().__init__('right', parent)

        self.setStyleSheet(
            """
            QFrame#SlideDrawer {
                background: rgba(8, 8, 10, 0.92);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
            }
            QLabel { color: rgba(255, 255, 255, 0.90); }
            QPushButton {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                padding: 6px 10px;
                color: rgba(255, 255, 255, 0.92);
            }
            QPushButton:hover { background: rgba(255, 255, 255, 0.14); }
            QCheckBox { color: rgba(255, 255, 255, 0.88); }
            QListWidget {
                background: rgba(0, 0, 0, 0.40);
                border: 1px solid rgba(255, 255, 255, 0.10);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.92);
                outline: none;
            }
            QListWidget::item {
                padding: 4px 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            QListWidget::item:last { border-bottom: none; }
            QListWidget::item:hover { background: rgba(255, 255, 255, 0.06); }
            QListWidget::item:selected {
                background: rgba(96, 130, 255, 0.38);
                color: rgba(255, 255, 255, 0.98);
            }
            QListWidget::item:selected:active { background: rgba(96, 130, 255, 0.48); }
            """
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(10)

        title = QLabel("Playlist")
        title.setStyleSheet("font-size: 14px; font-weight: 600;")
        layout.addWidget(title)

        self.folder_label = QLabel("")
        self.folder_label.setWordWrap(True)
        self.folder_label.setStyleSheet("font-size: 11px; color: rgba(255,255,255,0.85);")
        layout.addWidget(self.folder_label)

        self.auto_advance = QCheckBox("Auto-advance")
        self.auto_advance.setChecked(True)
        self.auto_advance.stateChanged.connect(lambda s: self.auto_advance_changed.emit(bool(s)))
        layout.addWidget(self.auto_advance)

        self.episode_list = QListWidget()
        self.episode_list.setSpacing(0)
        self.episode_list.setUniformItemSizes(True)
        self.episode_list.itemDoubleClicked.connect(self._on_episode_double_clicked)
        layout.addWidget(self.episode_list, stretch=1)

        nav = QHBoxLayout()
        self.prev_btn = QPushButton("⏮\ufe0e")
        self.prev_btn.setToolTip("Previous episode")
        self.prev_btn.clicked.connect(lambda: self._navigate(-1))
        nav.addWidget(self.prev_btn)

        self.next_btn = QPushButton("⏭\ufe0e")
        self.next_btn.setToolTip("Next episode")
        self.next_btn.clicked.connect(lambda: self._navigate(+1))
        nav.addWidget(self.next_btn)

        nav.addStretch()

        close_btn = QPushButton("✕")
        close_btn.clicked.connect(lambda: self.close(self.parent().width() if self.parent() else 1200))
        nav.addWidget(close_btn)

        layout.addLayout(nav)

        self._current_index = -1
        self._playlist_data: List[Dict] = []

    def populate_playlist(self, folder_path: str, episodes: List[Dict], current_index: int):
        try:
            self._playlist_data = episodes
            self._current_index = current_index
            self.folder_label.setText(folder_path)

            self.episode_list.clear()
            for idx, ep in enumerate(episodes):
                name = ep.get('name', Path(ep['path']).name)
                prefix = "▶ " if idx == current_index else "   "
                it = QListWidgetItem(f"{prefix}{name}")
                it.setData(Qt.ItemDataRole.UserRole, idx)
                self.episode_list.addItem(it)
                if idx == current_index:
                    it.setSelected(True)

            self.prev_btn.setEnabled(current_index > 0)
            self.next_btn.setEnabled(current_index < len(episodes) - 1)
        except Exception as e:
            print(f"PlaylistDrawer populate_playlist error: {e}")

    def _on_episode_double_clicked(self, item):
        try:
            self.episode_selected.emit(int(item.data(Qt.ItemDataRole.UserRole)))
        except Exception:
            pass

    def _navigate(self, direction: int):
        try:
            ni = self._current_index + direction
            if 0 <= ni < len(self._playlist_data):
                self.episode_selected.emit(ni)
        except Exception:
            pass


# ============================================================================
# Build 13 PlayerWindow - Stage-First Architecture
# ============================================================================

class PlayerWindow(QMainWindow):
    """
    Build 13 Player - Embedded Canvas Architecture.
    
    Stage-first design with stable geometry:
    - Render host geometry NEVER changes when controls show/hide
    - Top strip and bottom HUD are overlays on the stage
    - Panels are stage-anchored
    - Context menu is stage-anchored
    """
    
    def __init__(
        self,
        file_path: str,
        start_seconds: float = 0.0,
        progress_file: str = "",
        session_id: str = "",
        title: str = "Tankoban Player",
        video_id: str = "",
        show_id: str = "",
        playlist_file: str = "",
        playlist_index: int = -1,
        show_root_path: str = "",
        command_file: str = "",
        pref_aid: str = "",
        pref_sid: str = "",
        pref_sub_visibility: str = "",
    ):
        super().__init__()
        
        # Ensure normal OS window frame/borders (not kiosk-style frameless)
        try:
            self.setWindowFlag(Qt.WindowType.FramelessWindowHint, False)
        except Exception:
            pass
        
        if mpv is None:
            msg = f"Build 13: python-mpv import failed: {IMPORT_ERR}"
            QMessageBox.critical(self, "MPV Error", msg)
            raise RuntimeError(msg)
        
        # Build 13: Store params
        self._file_path = Path(file_path)
        self._start_seconds = start_seconds
        self._progress_file = Path(progress_file) if progress_file else None
        self._command_file = Path(command_file) if command_file else None
        self._session_id = session_id

        # Command file: allows the main app to instruct this running player to load a new file.
        # If not explicitly provided, derive it from the session id / progress file path.
        if self._command_file is None:
            try:
                if self._session_id and self._progress_file:
                    self._command_file = self._progress_file.parent / f"command_{self._session_id}.json"
            except Exception:
                self._command_file = None

        self._command_last_mtime = 0.0
        self._ui_event_seq = 0
        self._last_ui_event = None
        self._parent_hwnd = 0
        self._embedded_mode = False
        self._embedded_sync_timer = None

        # Window-state stability (Windows): keep restores/maximize predictable.
        self._state_transitioning = False
        self._ensure_max_timer = QTimer(self)
        self._ensure_max_timer.setSingleShot(True)
        self._ensure_max_timer.timeout.connect(self._ensure_maximized)

        # Coalesced fullscreen/minimize transitions (reduces resize shake / flicker on Windows)
        self._in_fs_transition = False
        self._updates_suppressed = False
        self._restore_updates_timer = QTimer(self)
        self._restore_updates_timer.setSingleShot(True)
        self._restore_updates_timer.timeout.connect(self._restore_updates)
        self._title = title
        self._video_id = video_id
        self._show_id = show_id
        self._show_root_path = Path(show_root_path) if show_root_path else self._file_path.parent

        # BUILD22: Preferred track selections passed from Tankoban (best-effort)
        self._pref_aid = str(pref_aid) if pref_aid is not None else ""
        self._pref_sid = str(pref_sid) if pref_sid is not None else ""
        self._pref_sub_visibility = str(pref_sub_visibility) if pref_sub_visibility is not None else ""

        # Track preference state (avoid polling mpv from Qt thread)
        self._last_aid = None
        self._last_sid = None
        self._last_sub_visibility = None
        self._respect_subtitle_styles = True
        
        # Build 19: Track last known position + reliable initial seek
        self._last_time_pos = float(start_seconds) if start_seconds and start_seconds > 0 else 0.0
        self._pending_initial_seek = float(start_seconds) if start_seconds and start_seconds > 0 else None
        self._initial_seek_attempts = 0

        # Cached mpv state (avoid polling properties from the Qt thread)
        self._last_duration = None
        self._cached_paused = False
        
        # Build 13: Playlist
        self._playlist: List[str] = []
        self._playlist_ids: List[str] = []
        self._playlist_index = playlist_index
        if playlist_file and Path(playlist_file).exists():
            try:
                data = json.loads(Path(playlist_file).read_text(encoding='utf-8'))
                # Build16: support both legacy list format and Build14 main-process format
                # { paths: [...], ids: [...], index: N }
                if isinstance(data, dict) and isinstance(data.get('paths'), list):
                    raw_paths = data.get('paths') or []
                    raw_ids = data.get('ids') if isinstance(data.get('ids'), list) else None

                    # Keep playlist paths and ids aligned by index.
                    self._playlist = []
                    self._playlist_ids = []
                    for idx, p in enumerate(raw_paths):
                        if isinstance(p, (str, Path)):
                            self._playlist.append(str(p))
                            if raw_ids is not None:
                                try:
                                    self._playlist_ids.append(str(raw_ids[idx]) if idx < len(raw_ids) else "")
                                except Exception:
                                    self._playlist_ids.append("")

                    if self._playlist_index < 0 and isinstance(data.get('index'), int):
                        self._playlist_index = int(data.get('index'))
                elif isinstance(data, list):
                    self._playlist = [str(x) for x in data]
            except Exception:
                pass
        
        if not self._playlist:
            self._build_folder_playlist()


        # Build16: constrain playlist to the active folder (season folder), never the whole show tree
        try:
            root = Path(self._show_root_path) if self._show_root_path else self._file_path.parent
            root = root.resolve()

            has_ids = isinstance(self._playlist_ids, list) and len(self._playlist_ids) == len(self._playlist) and len(self._playlist_ids) > 0
            filtered_paths = []
            filtered_ids = []

            for idx, item in enumerate(self._playlist):
                try:
                    pp = Path(str(item)).resolve()
                    if pp.parent == root:
                        filtered_paths.append(str(pp))
                        if has_ids:
                            try:
                                filtered_ids.append(str(self._playlist_ids[idx]))
                            except Exception:
                                filtered_ids.append("")
                except Exception:
                    pass

            if filtered_paths:
                self._playlist = filtered_paths
                self._playlist_ids = filtered_ids if has_ids else []

                if str(self._file_path.resolve()) in self._playlist:
                    self._playlist_index = self._playlist.index(str(self._file_path.resolve()))

                # If we have aligned ids, keep the current videoId in sync with the current index.
                if self._playlist_ids and 0 <= self._playlist_index < len(self._playlist_ids):
                    vid = str(self._playlist_ids[self._playlist_index] or "")
                    if vid:
                        self._video_id = vid
        except Exception:
            pass

        # Build 13: Progress tracking
        self._max_position = 0.0
        self._watched_time = 0.0
        # Build 5: Watched-time accumulator state (media-time deltas; ignore seeks/scrubs)
        self._watch_last_pos = None
        self._watch_last_wall = time.monotonic()
        self._last_progress_write = 0
        self._eof_signaled = False
        
        # Build 13: Volume state
        self._volume = 100
        self._muted = False
        # Build 23: Persisted player settings (volume/mute + subtitle HUD lift)
        self._subtitle_hud_lift_px = 40
        self._settings_file = self._derive_settings_file()
        self._settings_flush_timer = QTimer(self)
        self._settings_flush_timer.setSingleShot(True)
        self._settings_flush_timer.timeout.connect(self._save_player_settings)
        self._load_player_settings()

        
        # Build 13: Speed state
        self._speed = 1.0
        self._speed_presets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0]
        
        # Build 13: Quality state
        self._quality_mode = "Balanced"
        
        # Build 13: Info toggle
        self._info_visible = False
        
        # Build 13: Controls visibility
        self._controls_visible = False
        
        # Build 20.5: Bottom-edge tracking for HUD reveal
        self._was_in_bottom_zone = False

        # Build 13+: Embedded parity
        self._always_on_top = False
        self._auto_advance = True
        
        # Build 13: UI setup
        self.setWindowTitle(self._title)
        self._setup_ui()
        try:
            self._set_controls_visible(False)
        except Exception:
            pass
        try:
            self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
            if self.centralWidget():
                self.centralWidget().setFocusPolicy(Qt.FocusPolicy.StrongFocus)
            self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            self.activateWindow()
            self.raise_()
            self.grabKeyboard()
        except Exception:
            pass
        
        # Build 13: MPV initialization
        self._init_mpv()
        
        # Build 13: Timers
        self._setup_timers()
        
        # Build 13: Load file
        self._load_file(self._file_path, self._start_seconds)
    
    # ========== Persisted Settings (Volume/Mute/Subtitle Lift) ==========

    def _derive_settings_file(self) -> Path:
        """Choose where to store small persisted UI settings."""
        try:
            pf = getattr(self, "_progress_file", None)
            if isinstance(pf, Path) and pf:
                return pf.parent / "player_settings.json"
        except Exception:
            pass

        try:
            return Path.home() / ".tankoban" / "player_settings.json"
        except Exception:
            # Last resort: local working directory
            return Path("player_settings.json")

    def _load_player_settings(self) -> None:
        try:
            sf = getattr(self, "_settings_file", None)
            if not isinstance(sf, Path):
                return
            data = read_json(sf, {})
            if not isinstance(data, dict):
                return

            vol = data.get("volume", None)
            if vol is not None:
                try:
                    v = int(float(vol))
                except Exception:
                    v = None
                if v is not None:
                    self._volume = max(0, min(100, v))

            muted = data.get("muted", None)
            if muted is not None:
                try:
                    self._muted = bool(muted)
                except Exception:
                    pass

            lift = data.get("subtitle_hud_lift_px", None)
            if lift is not None:
                try:
                    lv = int(float(lift))
                    self._subtitle_hud_lift_px = max(0, min(300, lv))
                except Exception:
                    pass
        except Exception:
            pass

    def _schedule_save_player_settings(self) -> None:
        """Coalesce frequent changes (wheel/keys) into a single disk write."""
        try:
            t = getattr(self, "_settings_flush_timer", None)
            if not t:
                return
            t.stop()
            t.start(250)
        except Exception:
            pass

    def _save_player_settings(self) -> None:
        try:
            sf = getattr(self, "_settings_file", None)
            if not isinstance(sf, Path):
                return

            obj = {
                "volume": int(max(0, min(100, int(getattr(self, "_volume", 100) or 0)))),
                "muted": bool(getattr(self, "_muted", False)),
                "subtitle_hud_lift_px": int(max(0, min(300, int(getattr(self, "_subtitle_hud_lift_px", 40) or 0)))),
                "timestamp": time.time(),
            }
            atomic_write_json(sf, obj)
        except Exception:
            pass

    def _build_folder_playlist(self):
        """Build folder-scoped playlist."""
        try:
            folder = self._show_root_path
            files = sorted(
                [f for f in folder.glob("*") if f.is_file() and _is_video_file(str(f))],
                key=lambda x: _natural_sort_key(x.name)
            )
            self._playlist = [str(f) for f in files]
            
            if str(self._file_path) in self._playlist:
                self._playlist_index = self._playlist.index(str(self._file_path))
            else:
                self._playlist.insert(0, str(self._file_path))
                self._playlist_index = 0
        except Exception as e:
            print(f"Build folder playlist error: {e}")
            self._playlist = [str(self._file_path)]
            self._playlist_index = 0
    
    def _setup_ui(self):
        """
        Build 13 Stage-First UI Setup.
        
        Critical: The render host is placed first and its geometry is STABLE.
        All controls are overlays that do not affect the render host.
        """
        # Central widget is the stage container
        stage_container = QWidget()
        self.setCentralWidget(stage_container)
        
        # Stage layout (no margins, no spacing)
        stage_layout = QVBoxLayout(stage_container)
        stage_layout.setContentsMargins(0, 0, 0, 0)
        stage_layout.setSpacing(0)
        
                # Build 13: Render host (STABLE GEOMETRY) (STABLE GEOMETRY)
        self.render_host = MpvRenderHost(stage_container)
        self.render_host.wheel_volume_signal.connect(self._on_wheel_volume)
        self.render_host.right_click_signal.connect(self._show_context_menu)
        # Build 20.5: Mouse movement now handled directly in render host via _handle_mouse_move_for_hud
        stage_layout.addWidget(self.render_host, stretch=1)
        
        # Build 13: Top strip (overlay position)
        self.top_strip = TopStripWidget(self._file_path.name if getattr(self, "_file_path", None) else "", stage_container)
        self.top_strip.minimize_clicked.connect(self.showMinimized)
        self.top_strip.fullscreen_clicked.connect(self._toggle_fullscreen)
        self.top_strip.close_clicked.connect(self.close)

        # Build 13: Bottom HUD (overlay position)
        self.bottom_hud = BottomHUDWidget(stage_container)
        self.bottom_hud.back_clicked.connect(self._on_back)
        self.bottom_hud.tracks_clicked.connect(self._toggle_tracks_drawer)
        self.bottom_hud.speed_clicked.connect(self._show_speed_menu)
        self.bottom_hud.playlist_clicked.connect(self._toggle_playlist_drawer)

        # New compact pickers (menus/popovers) — do not open large drawers
        self.bottom_hud.audio_track_clicked.connect(self._show_audio_track_popover)
        self.bottom_hud.subtitle_track_clicked.connect(self._show_subtitle_track_popover)

        self.bottom_hud.aspect_clicked.connect(self._show_aspect_menu)
        self.bottom_hud.fullscreen_clicked.connect(self._toggle_fullscreen)
        try:
            self.bottom_hud.set_title(self._file_path.name)
        except Exception:
            pass
        try:
            self.top_strip.set_title(self._file_path.name)
        except Exception:
            pass
        try:
            self.bottom_hud.set_speed_label(getattr(self, '_speed', 1.0))
        except Exception:
            pass
        try:
            self.bottom_hud.set_quality_label(getattr(self, '_quality_mode', 'Balanced'))
        except Exception:
            pass
        self.bottom_hud.prev_clicked.connect(self._prev_episode)
        self.bottom_hud.play_pause_clicked.connect(self._toggle_play_pause)
        self.bottom_hud.next_clicked.connect(self._next_episode)
        self.bottom_hud.seek_requested.connect(self._on_seek_requested)
        self.bottom_hud.seek_step_requested.connect(self._seek_relative)
        
        # Build 13: Position overlays on stage
        self._position_overlays()
        
        # Build 13: Volume HUD
        self.volume_hud = VolumeHUD(stage_container)
        
        # Build 13: Center flash
        self.center_flash = CenterFlashWidget(stage_container)
        
        # Build 13: Diagnostics overlay
        self.diagnostics = DiagnosticsOverlay(stage_container)
        self.diagnostics.move(10, 10)
        
        # Build 13+: Toast feedback (embedded-style)
        self.toast = ToastHUD(stage_container)

        # Toast state (avoid initial load spam; allow suppression for UI-initiated changes)
        self._track_toasts_armed = False
        self._last_aid = None
        self._last_sid = None
        self._suppress_next_aid_toast = False
        self._suppress_next_sid_toast = False



        # Build 13+: Compact popovers for quick track switching (do not block timeline scrubbing)
        self.audio_popover = TrackPopover(stage_container, "Audio")
        self.subtitle_popover = TrackPopover(stage_container, "Subtitles")
        self.audio_popover.track_selected.connect(self._select_audio_track)
        self.subtitle_popover.track_selected.connect(self._select_subtitle_track)

        # Global click handler: close popovers on outside clicks without consuming the click
        try:
            self._popover_dismiss_filter = PopoverDismissFilter(self)
            QApplication.instance().installEventFilter(self._popover_dismiss_filter)
        except Exception:
            self._popover_dismiss_filter = None



        # Build 13+: Embedded-style slide drawers
        self.tracks_drawer = TracksDrawer(stage_container)
        self.tracks_drawer.audio_selected.connect(self._select_audio_track)
        self.tracks_drawer.subtitle_selected.connect(self._select_subtitle_track)
        self.tracks_drawer.load_subtitle_requested.connect(self._load_external_subtitle)
        self.tracks_drawer.audio_delay_changed.connect(self._set_audio_delay)
        self.tracks_drawer.subtitle_delay_changed.connect(self._set_subtitle_delay)
        self.tracks_drawer.aspect_changed.connect(self._set_aspect_ratio)
        self.tracks_drawer.subtitle_style_respect_changed.connect(self._set_subtitle_style_respect)
        self.tracks_drawer.subtitle_hud_lift_changed.connect(self._set_subtitle_hud_lift)
        try:
            self.tracks_drawer.set_subtitle_hud_lift_value(getattr(self, "_subtitle_hud_lift_px", 40))
        except Exception:
            pass

        self.playlist_drawer = PlaylistDrawer(stage_container)
        self.playlist_drawer.episode_selected.connect(self._load_episode_at_index)
        self.playlist_drawer.auto_advance_changed.connect(self._set_auto_advance)
        
        # Build 13: Context menu (will be created on-demand)
        self._context_menu = None
    
    def _position_overlays(self):
        """Position bottom HUD and drawers as overlays."""
        try:
            top_height = int(max(36, self.top_strip.sizeHint().height()))
        except Exception:
            top_height = 36

        try:
            bottom_height = int(max(80, self.bottom_hud.sizeHint().height()))
        except Exception:
            bottom_height = 90

        try:
            self._bottom_bar_height = bottom_height
        except Exception:
            pass

        # Bottom HUD at bottom
        try:
            self.bottom_hud.setGeometry(0, self.height() - bottom_height, self.width(), bottom_height)
            self.bottom_hud.raise_()
        except Exception:
            pass

        # Top strip at top
        try:
            self.top_strip.setGeometry(0, 0, self.width(), top_height)
            self.top_strip.raise_()
        except Exception:
            pass

        # Drawers (do not affect render geometry)
        try:
            drawer_w = min(520, max(360, int(self.width() * 0.38)))
            self.tracks_drawer.configure(width=drawer_w, top=0, bottom=bottom_height)
            self.playlist_drawer.configure(width=drawer_w, top=0, bottom=bottom_height)
            self.tracks_drawer.update_stage_geometry(self.width(), self.height())
            self.playlist_drawer.update_stage_geometry(self.width(), self.height())
        except Exception:
            pass

        # Keep subtitles above the HUD/timeline (do not let them get covered).
        try:
            self._apply_subtitle_safe_margin()
        except Exception:
            pass


    def _apply_subtitle_safe_margin(self):
        """Push subtitles up when the bottom HUD is visible.

        The HUD is an overlay on top of the video surface, so mpv-rendered
        subtitles can end up behind it. We compensate with mpv's bottom subtitle
        margin.
        """
        try:
            if not getattr(self, '_mpv', None):
                return

            # Prefer live HUD geometry when available (more accurate than sizeHint),
            # then fall back to the cached overlay placement height.
            hud_h = int(getattr(self, '_bottom_bar_height', 90) or 90)
            try:
                live_h = int(getattr(self.bottom_hud, 'height', lambda: 0)() or 0)
                if live_h > 0:
                    hud_h = max(hud_h, live_h)
            except Exception:
                pass
            controls = bool(getattr(self, '_controls_visible', False))
            # When controls are visible, move subs above the bar + a little breathing room.
            # When hidden, keep a small default margin for readability.
            extra_lift = int(max(0, min(300, int(getattr(self, '_subtitle_hud_lift_px', 40) or 0))))
            margin = int((hud_h + extra_lift) if controls else 28)
            margin = max(0, min(400, margin))

            # Also drive sub-pos (percentage from top; larger means lower).
            # This provides a second reliable lift path on files/styles where margin
            # handling alone is inconsistent.
            win_h = int(max(1, self.height()))
            if controls:
                cover_pct = ((hud_h + extra_lift) / float(win_h)) * 100.0
                sub_pos = int(round(100.0 - cover_pct))
            else:
                sub_pos = 95
            sub_pos = max(55, min(98, sub_pos))

            # ASS subtitles can ignore margins unless forced.
            try:
                self._mpv.command('set', 'sub-ass-force-margins', 'yes')
            except Exception:
                try:
                    self._mpv.sub_ass_force_margins = 'yes'
                except Exception:
                    pass

            # Ensure margin positioning is honored.
            try:
                self._mpv.command('set', 'sub-use-margins', 'yes')
            except Exception:
                try:
                    self._mpv.sub_use_margins = 'yes'
                except Exception:
                    pass

            # When HUD is visible, force ASS layout so subtitles reliably lift above timeline.
            # When hidden, restore the user's style preference.
            ass_mode = 'force' if controls else ('no' if bool(getattr(self, '_respect_subtitle_styles', True)) else 'strip')
            try:
                self._mpv.command('set', 'sub-ass-override', ass_mode)
            except Exception:
                try:
                    self._mpv.sub_ass_override = ass_mode
                except Exception:
                    pass

            try:
                self._mpv.command('set', 'sub-margin-y', str(margin))
            except Exception:
                try:
                    self._mpv.sub_margin_y = int(margin)
                except Exception:
                    pass

            try:
                self._mpv.command('set', 'sub-pos', str(sub_pos))
            except Exception:
                try:
                    self._mpv.sub_pos = int(sub_pos)
                except Exception:
                    pass
        except Exception:
            pass


    def resizeEvent(self, event):
        """Handle resize - maintain overlay positions."""
        super().resizeEvent(event)
        try:
            self._position_overlays()
        except Exception:
            pass

    def changeEvent(self, event):
        """Keep restores/maximize predictable and avoid multi-step resize shake (Windows).

        - Exiting fullscreen should land directly in maximized (single transition).
        - Restoring from minimize should restore as maximized (not odd restored geometry).
        """
        try:
            if event.type() == QEvent.Type.WindowStateChange:
                # If we're already applying a coalesced state transition, don't fight it.
                if getattr(self, "_state_transitioning", False):
                    return super().changeEvent(event)

                try:
                    old = event.oldState()
                except Exception:
                    old = Qt.WindowState.WindowNoState

                new = self.windowState()

                exited_fullscreen = bool(old & Qt.WindowState.WindowFullScreen) and not bool(new & Qt.WindowState.WindowFullScreen)
                restored_from_minimize = bool(old & Qt.WindowState.WindowMinimized) and not bool(new & Qt.WindowState.WindowMinimized)

                # If we explicitly handled a fullscreen toggle, suppress redundant enforcement.
                if exited_fullscreen and getattr(self, "_in_fs_transition", False):
                    return super().changeEvent(event)

                if (restored_from_minimize or exited_fullscreen) and (not self.isFullScreen()):
                    # Apply maximized immediately (coalesced) to avoid a visible intermediate restore geometry.
                    st = self.windowState()
                    st &= ~Qt.WindowState.WindowFullScreen
                    st &= ~Qt.WindowState.WindowMinimized
                    st |= Qt.WindowState.WindowMaximized
                    self._apply_window_state(st, suppress_updates=True, force_show=False, restore_delay_ms=30, clear_delay_ms=240)
        except Exception:
            pass
        return super().changeEvent(event)

    def showEvent(self, event):
        """Ensure the window comes back maximized after restores (without fighting fullscreen)."""
        try:
            if (not self.isFullScreen()) and (not self.isMinimized()) and (not getattr(self, "_state_transitioning", False)):
                self._schedule_ensure_maximized(0)
        except Exception:
            pass
        return super().showEvent(event)

    def _schedule_ensure_maximized(self, delay_ms: int = 0):
        """Coalesce maximize enforcement (prevents rapid flicker on Windows)."""
        try:
            if not getattr(self, "_ensure_max_timer", None):
                return
            self._ensure_max_timer.stop()
            self._ensure_max_timer.start(max(0, int(delay_ms)))
        except Exception:
            pass


    def _set_updates_suppressed(self, suppressed: bool) -> None:
        """Temporarily suppress repaints to reduce visible resizing/flicker during state transitions."""
        try:
            suppressed = bool(suppressed)
        except Exception:
            suppressed = False
        if bool(getattr(self, "_updates_suppressed", False)) == suppressed:
            return
        self._updates_suppressed = suppressed
        try:
            self.setUpdatesEnabled(not suppressed)
        except Exception:
            pass
        try:
            rh = getattr(self, "render_host", None)
            if rh is not None:
                rh.setUpdatesEnabled(not suppressed)
        except Exception:
            pass

    def _restore_updates(self) -> None:
        try:
            self._set_updates_suppressed(False)
            try:
                self.update()
            except Exception:
                pass
            try:
                rh = getattr(self, "render_host", None)
                if rh is not None:
                    rh.update()
            except Exception:
                pass
        except Exception:
            pass

    def _apply_window_state(
        self,
        target_state: Qt.WindowStates,
        *,
        suppress_updates: bool = True,
        force_show: bool = False,
        restore_delay_ms: int = 30,
        clear_delay_ms: int = 240,
        mark_fs_transition: bool = False,
    ) -> None:
        """Apply a single, coalesced window-state change (minimizes intermediate resizes)."""
        if getattr(self, "_embedded_mode", False):
            try:
                self.show()
                self._sync_embedded_geometry()
            except Exception:
                pass
            return
        try:
            if mark_fs_transition:
                self._in_fs_transition = True

            self._state_transitioning = True
            if suppress_updates:
                self._set_updates_suppressed(True)

            try:
                self.setWindowState(target_state)
            except Exception:
                # Fallback: try show variants
                try:
                    if bool(target_state & Qt.WindowState.WindowFullScreen):
                        self.showFullScreen()
                    elif bool(target_state & Qt.WindowState.WindowMaximized):
                        self.showMaximized()
                    else:
                        self.show()
                except Exception:
                    pass

            # Only force-show when needed (restoring from minimize / bringing to front)
            try:
                if force_show or (not self.isVisible()) or self.isMinimized():
                    self.show()
            except Exception:
                pass

            # Restore updates shortly after the WM applies the new state
            try:
                if suppress_updates and getattr(self, "_restore_updates_timer", None):
                    self._restore_updates_timer.stop()
                    self._restore_updates_timer.start(max(0, int(restore_delay_ms)))
            except Exception:
                pass

            # Clear transition flags after a short delay (coalesce repeated requests)
            def _clear_flags() -> None:
                try:
                    self._state_transitioning = False
                    self._in_fs_transition = False
                except Exception:
                    pass

            QTimer.singleShot(max(0, int(clear_delay_ms)), self, _clear_flags)
        except Exception:
            try:
                self._state_transitioning = False
                self._in_fs_transition = False
                self._set_updates_suppressed(False)
            except Exception:
                pass

    def _bring_to_front(self, ensure_maximized: bool = True) -> None:
        """Bring window to front and ensure maximized unless currently fullscreen."""
        try:
            # Restore from minimize if needed
            if self.isMinimized():
                st = self.windowState()
                st &= ~Qt.WindowState.WindowMinimized
                if ensure_maximized and (not self.isFullScreen()):
                    st &= ~Qt.WindowState.WindowFullScreen
                    st |= Qt.WindowState.WindowMaximized
                self._apply_window_state(st, suppress_updates=True, force_show=True, restore_delay_ms=30, clear_delay_ms=260)
            else:
                if ensure_maximized and (not self.isFullScreen()) and (not self.isMaximized()):
                    self._schedule_ensure_maximized(0)

            try:
                self.raise_()
            except Exception:
                pass
            try:
                self.activateWindow()
            except Exception:
                pass
            try:
                self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                self.grabKeyboard()
                rh = getattr(self, "render_host", None)
                if rh is not None:
                    rh.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            except Exception:
                pass

            # Windows fallback: keep this light to avoid visible maximize/restore flashing.
            try:
                if sys.platform.startswith("win") and not bool(getattr(self, "_embedded_mode", False)):
                    user32 = ctypes.windll.user32
                    hwnd = int(self.winId())
                    user32.BringWindowToTop(ctypes.c_void_p(hwnd))
                    user32.SetForegroundWindow(ctypes.c_void_p(hwnd))
            except Exception:
                pass
        except Exception:
            pass

    def _ensure_maximized(self):
        """Force maximized window state when not fullscreen/minimized (coalesced)."""
        try:
            if getattr(self, "_state_transitioning", False):
                return
            if self.isFullScreen() or self.isMinimized():
                return
            if self.isMaximized():
                return
            st = self.windowState()
            st &= ~Qt.WindowState.WindowFullScreen
            st &= ~Qt.WindowState.WindowMinimized
            st |= Qt.WindowState.WindowMaximized
            self._apply_window_state(st, suppress_updates=True, force_show=False, restore_delay_ms=30, clear_delay_ms=240)
        except Exception:
            try:
                self._state_transitioning = False
            except Exception:
                pass

    def _poll_command_file(self):
        """Poll for command file updates (single-instance playback switching)."""
        try:
            cf = getattr(self, "_command_file", None)
            if not cf:
                return
            cf = Path(cf)
            if not cf.exists():
                return
            try:
                st = cf.stat()
                mtime = float(st.st_mtime)
            except Exception:
                mtime = 0.0
            if not mtime or mtime <= float(getattr(self, "_command_last_mtime", 0.0) or 0.0):
                return
            self._command_last_mtime = mtime

            cmd = read_json(cf, None)
            # Consume the command file to avoid replays.
            try:
                cf.unlink(missing_ok=True)
            except Exception:
                pass

            if not isinstance(cmd, dict):
                return
            action = str(cmd.get("action") or "").lower().strip()
            if action != "open":
                return

            file_path = str(cmd.get("filePath") or "").strip()
            if not file_path:
                return

            try:
                start = float(cmd.get("startSeconds") or 0.0)
            except Exception:
                start = 0.0

            video_id = str(cmd.get("videoId") or "").strip()
            show_id = str(cmd.get("showId") or "").strip()
            show_root = str(cmd.get("showRootPath") or "").strip()

            playlist_paths = cmd.get("playlistPaths")
            playlist_ids = cmd.get("playlistIds")
            try:
                playlist_index = int(cmd.get("playlistIndex")) if cmd.get("playlistIndex") is not None else -1
            except Exception:
                playlist_index = -1

            self._open_external(
                file_path=file_path,
                start_seconds=start,
                video_id=video_id,
                show_id=show_id,
                show_root_path=show_root,
                playlist_paths=playlist_paths if isinstance(playlist_paths, list) else None,
                playlist_ids=playlist_ids if isinstance(playlist_ids, list) else None,
                playlist_index=playlist_index,
            )
            try:
                self._bring_to_front(ensure_maximized=True)
            except Exception:
                pass
        except Exception:
            pass

    def _open_external(
        self,
        file_path: str,
        start_seconds: float = 0.0,
        video_id: str = "",
        show_id: str = "",
        show_root_path: str = "",
        playlist_paths: Optional[List[str]] = None,
        playlist_ids: Optional[List[str]] = None,
        playlist_index: int = -1,
    ):
        """Load a new file into the already-running player."""
        try:
            try:
                self._write_progress("switch")
            except Exception:
                pass

            # Carry current track prefs forward (best-effort)
            try:
                if getattr(self, "_last_aid", None) is not None:
                    self._pref_aid = str(getattr(self, "_last_aid"))
                if getattr(self, "_last_sid", None) is not None:
                    self._pref_sid = str(getattr(self, "_last_sid"))
                if getattr(self, "_last_sub_visibility", None) is not None:
                    self._pref_sub_visibility = 'yes' if bool(getattr(self, "_last_sub_visibility")) else 'no'
            except Exception:
                pass

            new_path = Path(file_path)

            # Update library identity for progress tracking
            try:
                if video_id:
                    self._video_id = str(video_id)
                if show_id:
                    self._show_id = str(show_id)
            except Exception:
                pass

            # Update root (playlist filtering)
            try:
                self._show_root_path = Path(show_root_path) if show_root_path else new_path.parent
            except Exception:
                self._show_root_path = new_path.parent

            # Update playlist context if provided
            if playlist_paths and len(playlist_paths):
                try:
                    self._playlist = [str(p) for p in playlist_paths if p]
                    if playlist_ids and isinstance(playlist_ids, list):
                        self._playlist_ids = [str(x) for x in playlist_ids]
                    else:
                        self._playlist_ids = []
                except Exception:
                    self._playlist = [str(new_path)]
                    self._playlist_ids = []
            else:
                self._file_path = new_path
                self._build_folder_playlist()

            # Choose playlist index
            try:
                if isinstance(playlist_index, int) and 0 <= playlist_index < len(self._playlist):
                    self._playlist_index = int(playlist_index)
                else:
                    pstr = str(new_path)
                    self._playlist_index = self._playlist.index(pstr) if pstr in self._playlist else 0
            except Exception:
                self._playlist_index = 0

            # Align video id to playlist item (if available)
            try:
                if getattr(self, "_playlist_ids", None) and 0 <= self._playlist_index < len(self._playlist_ids):
                    vid = str(self._playlist_ids[self._playlist_index] or "")
                    if vid:
                        self._video_id = vid
            except Exception:
                pass

            # Ensure file path aligns to selected index
            try:
                if self._playlist and 0 <= self._playlist_index < len(self._playlist):
                    new_path = Path(self._playlist[self._playlist_index])
            except Exception:
                pass

            self._file_path = new_path

            try:
                self.bottom_hud.set_title(new_path.name)
            except Exception:
                pass
            try:
                self.top_strip.set_title(new_path.name)
            except Exception:
                pass

            self._load_file(new_path, float(start_seconds or 0.0))

            try:
                if hasattr(self, 'playlist_drawer') and self.playlist_drawer.is_open():
                    self._populate_playlist_drawer()
            except Exception:
                pass

            try:
                self.toast.show_toast("Switched")
            except Exception:
                pass
        except Exception:
            pass
    

    def _handle_ipc_payload(self, msg: Dict[str, Any]) -> None:
        """Handle a JSON IPC message from another process (single-instance behavior)."""
        try:
            if not isinstance(msg, dict):
                return
            cmd = str(msg.get("cmd") or msg.get("action") or "").strip().lower()
            if cmd != "open":
                return

            file_path = str(msg.get("file") or msg.get("filePath") or msg.get("file_path") or "").strip()
            if not file_path:
                return

            try:
                start = float(msg.get("start") if msg.get("start") is not None else msg.get("startSeconds") or 0.0)
            except Exception:
                start = 0.0

            title = str(msg.get("title") or "").strip()
            if title:
                try:
                    self._title = title
                    self.setWindowTitle(self._title)
                except Exception:
                    pass

            # Optional identity/progress updates (best-effort)
            try:
                pf = str(msg.get("progress_file") or msg.get("progressFile") or "").strip()
                if pf:
                    self._progress_file = Path(pf)
            except Exception:
                pass
            try:
                cf = str(msg.get("command_file") or msg.get("commandFile") or "").strip()
                if cf:
                    self._command_file = Path(cf)
            except Exception:
                pass

            video_id = str(msg.get("video_id") or msg.get("videoId") or "").strip()
            show_id = str(msg.get("show_id") or msg.get("showId") or "").strip()
            show_root = str(msg.get("show_root_path") or msg.get("showRootPath") or msg.get("show_root") or "").strip()

            # Playlist context: accept either playlist_file or direct paths/ids
            playlist_file = str(msg.get("playlist_file") or msg.get("playlistFile") or "").strip()
            try:
                playlist_index = int(msg.get("playlist_index") if msg.get("playlist_index") is not None else msg.get("playlistIndex") or -1)
            except Exception:
                playlist_index = -1

            playlist_paths = None
            playlist_ids = None

            if isinstance(msg.get("playlist_paths"), list):
                try:
                    playlist_paths = [str(x) for x in (msg.get("playlist_paths") or []) if x]
                except Exception:
                    playlist_paths = None
            if isinstance(msg.get("playlist_ids"), list):
                try:
                    playlist_ids = [str(x) for x in (msg.get("playlist_ids") or [])]
                except Exception:
                    playlist_ids = None

            if (playlist_paths is None) and playlist_file:
                try:
                    pfp = Path(playlist_file)
                    if pfp.exists():
                        data = read_json(pfp, None)
                        if isinstance(data, dict) and isinstance(data.get("paths"), list):
                            playlist_paths = [str(x) for x in (data.get("paths") or []) if x]
                            if isinstance(data.get("ids"), list):
                                playlist_ids = [str(x) for x in (data.get("ids") or [])]
                            if playlist_index < 0 and isinstance(data.get("index"), int):
                                playlist_index = int(data.get("index"))
                        elif isinstance(data, list):
                            playlist_paths = [str(x) for x in data if x]
                except Exception:
                    pass

            # Execute open in-place
            self._open_external(
                file_path=file_path,
                start_seconds=start,
                video_id=video_id,
                show_id=show_id,
                show_root_path=show_root,
                playlist_paths=playlist_paths if isinstance(playlist_paths, list) else None,
                playlist_ids=playlist_ids if isinstance(playlist_ids, list) else None,
                playlist_index=playlist_index,
            )

            # Bring to front and keep maximized unless still fullscreen
            self._bring_to_front(ensure_maximized=True)
        except Exception:
            pass

    def attach_to_parent_hwnd(self, parent_hwnd: int) -> bool:
        """Embed this player window inside a native parent HWND (Windows)."""
        if not sys.platform.startswith("win"):
            return False
        try:
            parent = int(parent_hwnd or 0)
        except Exception:
            parent = 0
        if parent <= 0:
            return False

        try:
            child = int(self.winId())
        except Exception:
            return False

        user32 = ctypes.windll.user32
        GWL_STYLE = -16
        GWL_EXSTYLE = -20
        WS_CHILD = 0x40000000
        WS_CAPTION = 0x00C00000
        WS_THICKFRAME = 0x00040000
        WS_MINIMIZEBOX = 0x00020000
        WS_MAXIMIZEBOX = 0x00010000
        WS_SYSMENU = 0x00080000
        WS_POPUP = 0x80000000
        WS_EX_APPWINDOW = 0x00040000
        SWP_NOZORDER = 0x0004
        SWP_NOOWNERZORDER = 0x0200
        SWP_FRAMECHANGED = 0x0020
        SWP_SHOWWINDOW = 0x0040

        try:
            user32.SetParent(ctypes.c_void_p(child), ctypes.c_void_p(parent))

            style = int(user32.GetWindowLongW(ctypes.c_void_p(child), GWL_STYLE))
            style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU | WS_POPUP)
            style |= WS_CHILD
            user32.SetWindowLongW(ctypes.c_void_p(child), GWL_STYLE, style)

            ex_style = int(user32.GetWindowLongW(ctypes.c_void_p(child), GWL_EXSTYLE))
            ex_style &= ~WS_EX_APPWINDOW
            user32.SetWindowLongW(ctypes.c_void_p(child), GWL_EXSTYLE, ex_style)

            self._parent_hwnd = parent
            self._embedded_mode = True
            self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, False)
            self.show()
            try:
                if hasattr(self, "top_strip") and self.top_strip is not None:
                    self.top_strip.hide()
            except Exception:
                pass
            self._sync_embedded_geometry()

            if self._embedded_sync_timer is None:
                self._embedded_sync_timer = QTimer(self)
                self._embedded_sync_timer.setInterval(150)
                self._embedded_sync_timer.timeout.connect(self._sync_embedded_geometry)
            self._embedded_sync_timer.start()
            return True
        except Exception:
            return False

    def _sync_embedded_geometry(self) -> None:
        if not sys.platform.startswith("win"):
            return
        if not getattr(self, "_embedded_mode", False):
            return
        parent = int(getattr(self, "_parent_hwnd", 0) or 0)
        if parent <= 0:
            return
        try:
            child = int(self.winId())
        except Exception:
            return

        class _RECT(ctypes.Structure):
            _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

        try:
            user32 = ctypes.windll.user32
            rect = _RECT()
            if not user32.GetClientRect(ctypes.c_void_p(parent), ctypes.byref(rect)):
                return
            w = max(1, int(rect.right - rect.left))
            h = max(1, int(rect.bottom - rect.top))
            user32.SetWindowPos(
                ctypes.c_void_p(child),
                ctypes.c_void_p(0),
                0,
                0,
                w,
                h,
                0x0004 | 0x0200 | 0x0020 | 0x0040,  # SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW
            )
        except Exception:
            return

    def _init_mpv(self):
        """Initialize MPV with Build 13 settings."""
        try:
            self._mpv = mpv.MPV(
                log_handler=_safe_mpv_log,
                # Keep Qt playback logs lightweight so the Electron main process
                # is not flooded by mpv info spam during repeated open/close cycles.
                loglevel='warn',
                # Build 13: Quality settings
                vo='gpu-next',
                hwdec='auto',
                gpu_api='vulkan',
                # Build 13: Initial volume
                volume=self._volume,
                # Build 13: OSD
                osd_level=1,
                osd_duration=2000,
                # Build 13: Chapters
                chapters_file='',
            )
            
            # Attach to render host
            self.render_host.attach_mpv(self._mpv)
            
            # Apply persisted mute state (best-effort)
            try:
                self._mpv.mute = bool(getattr(self, '_muted', False))
            except Exception:
                pass
            
            # Build 13: Property observers
            self._mpv.observe_property('time-pos', self._on_time_pos)
            self._mpv.observe_property('duration', self._on_duration)
            try:
                self._mpv.observe_property('chapter-list', self._on_chapter_list)
            except Exception:
                pass
            self._mpv.observe_property('pause', self._on_pause_change)
            self._mpv.observe_property('eof-reached', self._on_eof)

            # Track/subtitle change toasts
            try:
                self._mpv.observe_property('aid', self._on_aid_change)
                self._mpv.observe_property('sid', self._on_sid_change)
                self._mpv.observe_property('sub-visibility', self._on_sub_visibility_change)
            except Exception:
                pass
            
            # Build 13+: Embedded subtitle styles default (respect embedded ASS/SSA)
            try:
                self._mpv.sub_ass_override = 'no' if bool(getattr(self, '_respect_subtitle_styles', True)) else 'strip'
            except Exception:
                try:
                    self._mpv.command('set', 'sub-ass-override', 'no' if bool(getattr(self, '_respect_subtitle_styles', True)) else 'strip')
                except Exception:
                    pass

            # Keep ASS subtitles inside margins so we can push them above the HUD.
            try:
                self._mpv.sub_ass_force_margins = 'yes'
            except Exception:
                try:
                    self._mpv.command('set', 'sub-ass-force-margins', 'yes')
                except Exception:
                    pass
            try:
                self._mpv.sub_use_margins = 'yes'
            except Exception:
                try:
                    self._mpv.command('set', 'sub-use-margins', 'yes')
                except Exception:
                    pass

            # Initial subtitle safe margin (will be updated on resize / HUD show/hide).
            try:
                self._apply_subtitle_safe_margin()
            except Exception:
                pass

            
        except Exception as e:
            print(f"Build 13 MPV init error: {e}")
            raise
    
    def _setup_timers(self):
        """Setup Build 13 timers."""
        # Progress write timer
        self._progress_timer = QTimer(self)
        self._progress_timer.timeout.connect(lambda: self._write_progress("periodic"))
        self._progress_timer.start(5000)
        
        # UI update timer
        self._ui_timer = QTimer(self)
        self._ui_timer.timeout.connect(self._update_ui)
        self._ui_timer.start(250)
        
        # Controls hide timer
        self._hide_controls_timer = QTimer(self)
        self._hide_controls_timer.setSingleShot(True)
        self._hide_controls_timer.timeout.connect(lambda: self._set_controls_visible(False))
        
        # Cursor hide timer (fullscreen only)
        self._hide_cursor_timer = QTimer(self)
        self._hide_cursor_timer.setSingleShot(True)
        self._hide_cursor_timer.timeout.connect(self._maybe_hide_cursor)
        
        # Resume timer (for restore after buffer)
        self._resume_timer = QTimer(self)
        self._resume_timer.setSingleShot(True)
        self._resume_timer.timeout.connect(self._resume_after_buffer)

        # Command polling timer (single-instance open requests)
        self._command_timer = QTimer(self)
        self._command_timer.timeout.connect(self._poll_command_file)
        self._command_timer.start(600)
    
    # ========== MPV Property Observers ==========
    
    def _on_time_pos(self, _name, value):
        """Track playback position."""
        try:
            if value is not None:
                v = float(value)
                self._last_time_pos = v
                self._max_position = max(self._max_position, v)

                # Build 19: Ensure initial seek is applied after file load (best-effort, no new timers)
                try:
                    if self._pending_initial_seek is not None and self._initial_seek_attempts < 4:
                        target = float(self._pending_initial_seek)
                        # If we're already at/near target, mark done.
                        if v >= (target - 0.5):
                            self._pending_initial_seek = None
                        else:
                            # Retry seek a few times early in playback if mpv ignored the initial seek.
                            if v <= 1.0 or v < (target - 1.0):
                                try:
                                    self._mpv.command('seek', str(target), 'absolute')
                                except Exception:
                                    pass
                            self._initial_seek_attempts += 1
                except Exception:
                    pass
        except Exception:
            pass
    
    def _on_duration(self, _name, value):
        """Handle duration changes."""
        try:
            if value is None:
                self._last_duration = None
            else:
                self._last_duration = float(value)
        except Exception:
            pass

    def _arm_track_toasts_after_load(self):
        """Arm track/subtitle toasts after file load so initial property churn doesn't spam."""
        try:
            self._track_toasts_armed = False

            def arm():
                try:
                    self._last_aid = getattr(self._mpv, 'aid', None)
                    self._last_sid = getattr(self._mpv, 'sid', None)
                except Exception:
                    self._last_aid = None
                    self._last_sid = None
                self._track_toasts_armed = True

            QTimer.singleShot(800, self, arm)
        except Exception:
            pass

    def _format_audio_track_label(self, aid_value) -> str:
        try:
            tl = self._mpv.track_list or []
            for t in tl:
                try:
                    if t.get('type') == 'audio' and str(t.get('id')) == str(aid_value):
                        lang = (t.get('lang') or '').strip()
                        title = (t.get('title') or '').strip()
                        bits = []
                        if lang:
                            bits.append(lang.upper())
                        if title and ((not lang) or (title.lower() != lang.lower())):
                            bits.append(title)
                        if bits:
                            return ' · '.join(bits)
                        return f"#{aid_value}"
                except Exception:
                    continue
        except Exception:
            pass
        try:
            return f"#{aid_value}" if aid_value is not None else ''
        except Exception:
            return ''

    def _format_subtitle_track_label(self, sid_value) -> str:
        try:
            if sid_value in (None, 'no', 0, '0', False):
                return ''
            tl = self._mpv.track_list or []
            for t in tl:
                try:
                    if t.get('type') == 'sub' and str(t.get('id')) == str(sid_value):
                        lang = (t.get('lang') or '').strip()
                        title = (t.get('title') or '').strip()
                        bits = []
                        if lang:
                            bits.append(lang.upper())
                        if title and ((not lang) or (title.lower() != lang.lower())):
                            bits.append(title)
                        if bits:
                            return ' · '.join(bits)
                        return f"#{sid_value}"
                except Exception:
                    continue
        except Exception:
            pass
        try:
            return f"#{sid_value}" if sid_value not in (None, 'no') else ''
        except Exception:
            return ''

    def _on_aid_change(self, _name, value):
        try:
            # BUILD22: track current selection for persistence
            self._last_aid = value
            QTimer.singleShot(0, self, lambda v=value: self._emit_aid_toast(v))
        except Exception:
            pass

    def _on_sid_change(self, _name, value):
        try:
            # BUILD22: track current selection for persistence
            self._last_sid = value
            QTimer.singleShot(0, self, lambda v=value: self._emit_sid_toast(v))
        except Exception:
            pass

    def _on_sub_visibility_change(self, _name, value):
        """Track subtitle visibility preference for persistence."""
        try:
            # mpv reports yes/no (str) or bool depending on binding
            self._last_sub_visibility = bool(value) if value is not None else None
        except Exception:
            try:
                self._last_sub_visibility = None
            except Exception:
                pass

    def _emit_aid_toast(self, value):
        try:
            if getattr(self, '_suppress_next_aid_toast', False):
                self._suppress_next_aid_toast = False
                self._last_aid = value
                return
            if not getattr(self, '_track_toasts_armed', False):
                self._last_aid = value
                return
            if value == getattr(self, '_last_aid', None):
                return
            self._last_aid = value
            label = self._format_audio_track_label(value)
            txt = f"♪ {label}" if label else '♪'
            self.toast.show_toast(txt)
            try:
                if self.tracks_drawer.is_open():
                    self._refresh_track_lists()
            except Exception:
                pass
        except Exception:
            pass

    def _emit_sid_toast(self, value):
        try:
            if getattr(self, '_suppress_next_sid_toast', False):
                self._suppress_next_sid_toast = False
                self._last_sid = value
                return
            if not getattr(self, '_track_toasts_armed', False):
                self._last_sid = value
                return
            if value == getattr(self, '_last_sid', None):
                return
            self._last_sid = value
            if value in (None, 'no', 0, '0', False):
                txt = 'CC ⦸'
            else:
                label = self._format_subtitle_track_label(value)
                txt = f"CC {label}" if label else 'CC'
            self.toast.show_toast(txt)
            try:
                if self.tracks_drawer.is_open():
                    self._refresh_track_lists()
            except Exception:
                pass
        except Exception:
            pass



    def _on_chapter_list(self, _name, value):
        """Receive chapter list from mpv and forward to the scrubber for markers."""
        try:
            ch = []
            if isinstance(value, list):
                for c in value:
                    try:
                        if isinstance(c, dict) and 'time' in c:
                            ch.append(float(c.get('time') or 0.0))
                    except Exception:
                        continue
            ch = [t for t in ch if t >= 0.0]
            ch.sort()
            self._chapter_times = ch
            try:
                self.bottom_hud.set_chapters(ch)
            except Exception:
                pass
        except Exception:
            return

    
    def _on_pause_change(self, _name, value):
        """Update UI when pause state changes.

        NOTE: mpv observers may fire off the Qt thread. Schedule UI updates onto the Qt thread.
        """
        try:
            is_paused = bool(value)
            self._cached_paused = is_paused

            # Ensure UI updates happen on the Qt thread
            try:
                QTimer.singleShot(0, self, lambda p=is_paused: self.bottom_hud.set_play_pause_icon(not p))
            except Exception:
                pass
        except Exception:
            pass
    
    def _on_eof(self, _name, value):
        """Handle end of file."""
        try:
            if value and not self._eof_signaled:
                self._eof_signaled = True
                self._write_progress("eof")
                if self._auto_advance:
                    QTimer.singleShot(500, self._next_episode)
                else:
                    try:
                        self._mpv.pause = True
                    except Exception:
                        pass
                    try:
                        self.toast.show_toast("Ended")
                    except Exception:
                        pass
        except Exception:
            pass
    
    # ========== UI Updates ==========
    
    def _update_ui(self):
        """Update UI elements.

        Avoid polling libmpv properties from the Qt UI thread (can freeze the event loop if mpv blocks).
        Use values cached by mpv observers instead.
        """
        try:
            pos = getattr(self, "_last_time_pos", None)
            dur = getattr(self, "_last_duration", None)

            self.bottom_hud.update_scrubber(pos, dur)
            self.bottom_hud.update_time_labels(pos, dur)

            # Build 5: Track watched time via media-time deltas, not wall clock.
            # Ignore large jumps (seeks/scrubs) so "watched" means real playback.
            is_paused = getattr(self, "_cached_paused", False)
            try:
                now_m = time.monotonic()
            except Exception:
                now_m = None

            try:
                last_wall = getattr(self, "_watch_last_wall", None)
                last_pos = getattr(self, "_watch_last_pos", None)
            except Exception:
                last_wall = None
                last_pos = None

            if pos is not None and now_m is not None:
                try:
                    pos_f = float(pos)
                except Exception:
                    pos_f = None

                if pos_f is not None:
                    if not is_paused and last_pos is not None and last_wall is not None:
                        try:
                            dt = float(now_m) - float(last_wall)
                            dpos = float(pos_f) - float(last_pos)
                            if dt > 0 and dpos > 0:
                                sp = float(getattr(self, "_speed", 1.0) or 1.0)
                                speed = sp if sp > 0 else 1.0
                                max_count = max(3.0, (dt * speed * 1.75) + 1.0)
                                # Large jumps are almost certainly seeks/scrubs — don't count as watched time.
                                if dpos <= max_count:
                                    self._watched_time += dpos
                        except Exception:
                            pass

                    # Always update the accumulator anchors.
                    try:
                        self._watch_last_wall = float(now_m)
                        self._watch_last_pos = float(pos_f)
                    except Exception:
                        pass

            # Update diagnostics if visible (best-effort)
            if self._info_visible:
                self._update_diagnostics()
        except Exception:
            pass
    
    def _update_diagnostics(self):
        """Update diagnostics overlay."""
        try:
            info = {
                "Position": _fmt_time(getattr(self, "_last_time_pos", None)),
                "Duration": _fmt_time(getattr(self, "_last_duration", None)),
                "FPS": f"{self._mpv.estimated_vf_fps or 0:.2f}",
                "Drop Count": self._mpv.frame_drop_count or 0,
                "Quality": self._quality_mode,
                "Speed": f"{self._speed}x",
            }
            self.diagnostics.update_diagnostics(info)
        except Exception:
            pass
    
    # ========== Controls Visibility ==========

    def _show_cursor(self):
        try:
            if self.cursor().shape() == Qt.CursorShape.BlankCursor:
                self.setCursor(Qt.CursorShape.ArrowCursor)
        except Exception:
            try:
                self.setCursor(Qt.CursorShape.ArrowCursor)
            except Exception:
                pass

    def _arm_cursor_autohide(self):
        """Hide cursor after short idle in fullscreen, but always show on movement."""
        try:
            if not getattr(self, "isFullScreen", lambda: False)():
                if hasattr(self, "_hide_cursor_timer"):
                    self._hide_cursor_timer.stop()
                return

            # If controls or an overlay is visible, keep the cursor visible.
            if getattr(self, "_controls_visible", False) or self._any_overlay_open():
                if hasattr(self, "_hide_cursor_timer"):
                    self._hide_cursor_timer.stop()
                self._show_cursor()
                return

            if hasattr(self, "_hide_cursor_timer"):
                self._hide_cursor_timer.stop()
                self._hide_cursor_timer.start(2000)
        except Exception:
            pass

    def _maybe_hide_cursor(self):
        try:
            if self.isFullScreen() and (not getattr(self, "_controls_visible", False)) and (not self._any_overlay_open()):
                self.setCursor(Qt.CursorShape.BlankCursor)
            else:
                self.setCursor(Qt.CursorShape.ArrowCursor)
        except Exception:
            pass

    def _on_mouse_activity(self, pos: QPoint):
        """Any movement should reveal cursor; HUD only reveals in the bottom zone."""
        try:
            self._show_cursor()
            self._arm_cursor_autohide()
        except Exception:
            pass
        try:
            self._handle_mouse_move_for_hud(pos)
        except Exception:
            pass

    
    def _any_overlay_open(self) -> bool:
        try:
            if hasattr(self, 'tracks_drawer') and self.tracks_drawer and self.tracks_drawer.is_open():
                return True
            if hasattr(self, 'playlist_drawer') and self.playlist_drawer and self.playlist_drawer.is_open():
                return True
            # Compact popovers (audio/subtitles)
            if getattr(self, 'audio_popover', None) and self.audio_popover.isVisible():
                return True
            if getattr(self, 'subtitle_popover', None) and self.subtitle_popover.isVisible():
                return True
        except Exception:
            pass
        return False


    def _arm_controls_autohide(self):
        """Start/refresh the HUD auto-hide timer unless an overlay drawer is open."""
        try:
            if getattr(self, "_controls_visible", False) and not self._any_overlay_open():
                self._hide_controls_timer.stop()
                self._hide_controls_timer.start(3000)
            else:
                self._hide_controls_timer.stop()
        except Exception:
            pass

    def _set_controls_visible(self, visible: bool):
        """Show/hide controls WITHOUT changing render host geometry."""
        try:
            if getattr(self, "_embedded_mode", False):
                # Embedded mode: player should behave like part of host app UI, not a nested window.
                try:
                    self.top_strip.hide()
                except Exception:
                    pass
                self._controls_visible = bool(visible)
                try:
                    if visible:
                        self.bottom_hud.show()
                    else:
                        self.bottom_hud.hide()
                except Exception:
                    pass
                try:
                    self._apply_subtitle_safe_margin()
                except Exception:
                    pass
                return

            self._controls_visible = bool(visible)

            if visible:
                try:
                    self.top_strip.show()
                except Exception:
                    pass
                try:
                    self.bottom_hud.show()
                except Exception:
                    pass
                # Keep subtitles above the HUD/timeline when controls are visible.
                try:
                    self._apply_subtitle_safe_margin()
                except Exception:
                    pass
                # Cursor should always be visible when controls are visible
                try:
                    self.setCursor(Qt.CursorShape.ArrowCursor)
                except Exception:
                    pass
                try:
                    if hasattr(self, "_hide_cursor_timer"):
                        self._hide_cursor_timer.stop()
                except Exception:
                    pass
                self._arm_controls_autohide()
            else:
                try:
                    self.top_strip.hide()
                except Exception:
                    pass
                try:
                    self.bottom_hud.hide()
                except Exception:
                    pass
                # Restore a smaller subtitle margin when the HUD is hidden.
                try:
                    self._apply_subtitle_safe_margin()
                except Exception:
                    pass
                try:
                    self._hide_controls_timer.stop()
                except Exception:
                    pass

                # Don't "brick" the cursor by blanking it immediately.
                # We use a cursor timer so any movement brings it back.
                try:
                    self.setCursor(Qt.CursorShape.ArrowCursor)
                except Exception:
                    pass
                try:
                    self._arm_cursor_autohide()
                except Exception:
                    pass
        except Exception:
            pass



    def _handle_mouse_move_for_hud(self, pos: QPoint):
        """HUD reveals only when the mouse is in the bottom activation zone."""
        try:
            BOTTOM_ZONE_HEIGHT = int(max(110, getattr(self, '_bottom_bar_height', 90) + 20))
            bottom_threshold = max(0, int(self.height() - BOTTOM_ZONE_HEIGHT))
            is_in_bottom_zone = (int(pos.y()) >= bottom_threshold)

            if is_in_bottom_zone:
                # Show + refresh hide timer on any movement in the zone
                if not getattr(self, "_controls_visible", False):
                    self._set_controls_visible(True)
                else:
                    self._arm_controls_autohide()

            self._was_in_bottom_zone = bool(is_in_bottom_zone)
        except Exception:
            pass

    def _load_file(self, path: Path, start_at: float = 0.0):
        """Load video file."""
        try:
            try:
                self._chapter_times = []
                self.bottom_hud.set_chapters([])
            except Exception:
                pass
            # Build 19: set pending initial seek (best-effort) before/after load
            self._pending_initial_seek = float(start_at) if start_at and start_at > 0 else None
            self._initial_seek_attempts = 0

            self._mpv.loadfile(str(path))
            if start_at > 0:
                try:
                    self._mpv.command('seek', str(start_at), 'absolute')
                except Exception:
                    try:
                        self._mpv.seek(start_at, 'absolute')
                    except Exception:
                        pass
            self._mpv.pause = False
            
            # Reset tracking
            self._max_position = start_at
            self._watched_time = 0.0
            # Build 5: reset watched-time accumulator for the new file
            self._watch_last_pos = None
            self._watch_last_wall = time.monotonic()
            self._eof_signaled = False
            
            # Update UI
            self.bottom_hud.set_title(path.name)
            try:
                self.top_strip.set_title(path.name)
            except Exception:
                pass
            self._refresh_track_lists()
            try:
                self._arm_track_toasts_after_load()
            except Exception:
                pass

            # BUILD22: Apply persisted track preferences after load (best-effort)
            try:
                QTimer.singleShot(250, self, self._apply_track_prefs_after_load)
            except Exception:
                pass
            
        except Exception as e:
            print(f"Load file error: {e}")

    def _apply_track_prefs_after_load(self):
        """Apply preferred audio/subtitle selections (best-effort)."""
        try:
            if not getattr(self, '_mpv', None):
                return
            aid = str(getattr(self, '_pref_aid', '') or '').strip()
            sid = str(getattr(self, '_pref_sid', '') or '').strip()
            subv_raw = str(getattr(self, '_pref_sub_visibility', '') or '').strip().lower()

            if aid:
                try:
                    self._suppress_next_aid_toast = True
                except Exception:
                    pass
                try:
                    self._mpv.command('set', 'aid', aid)
                except Exception:
                    try:
                        self._mpv.aid = aid
                    except Exception:
                        pass

            if sid:
                try:
                    self._suppress_next_sid_toast = True
                except Exception:
                    pass
                try:
                    self._mpv.command('set', 'sid', sid)
                except Exception:
                    try:
                        self._mpv.sid = sid
                    except Exception:
                        pass

            if subv_raw:
                want = subv_raw in ('1', 'true', 'yes', 'on')
                try:
                    self._mpv.command('set', 'sub-visibility', 'yes' if want else 'no')
                except Exception:
                    try:
                        self._mpv.sub_visibility = want
                    except Exception:
                        pass
        except Exception:
            pass
    
    def _load_episode_at_index(self, index: int):
        """Load episode from playlist."""
        try:
            if 0 <= index < len(self._playlist):
                self._write_progress("episode_change")
                self._playlist_index = index

                # Keep videoId aligned to the playlist item (so the library can persist progress per-episode)
                if getattr(self, '_playlist_ids', None) and 0 <= index < len(self._playlist_ids):
                    try:
                        vid = str(self._playlist_ids[index] or "")
                        if vid:
                            self._video_id = vid
                    except Exception:
                        pass

                new_path = Path(self._playlist[index])
                self._file_path = new_path
                # BUILD22: Carry user-selected track prefs across episode changes (best-effort)
                try:
                    if getattr(self, '_last_aid', None) is not None:
                        self._pref_aid = str(getattr(self, '_last_aid'))
                    if getattr(self, '_last_sid', None) is not None:
                        self._pref_sid = str(getattr(self, '_last_sid'))
                    if getattr(self, '_last_sub_visibility', None) is not None:
                        self._pref_sub_visibility = 'yes' if bool(getattr(self, '_last_sub_visibility')) else 'no'
                except Exception:
                    pass
                self._load_file(new_path, 0.0)
                
                # Update playlist drawer if open
                if hasattr(self, 'playlist_drawer') and self.playlist_drawer.is_open():
                    self._populate_playlist_drawer()
        except Exception as e:
            print(f"Load episode error: {e}")
    
    # ========== Playback Controls ==========
    
    def _toggle_play_pause(self):
        """Toggle play/pause."""
        try:
            self._mpv.pause = not self._mpv.pause
            icon = "⏸" if not self._mpv.pause else "▶"
            self.center_flash.flash(icon)
        except Exception:
            pass
    
    def _seek_relative(self, seconds: float):
        """Seek relative."""
        try:
            self._mpv.command('seek', str(seconds), 'relative')
            try:
                mag = abs(float(seconds))
                if mag < 60:
                    delta = f"{int(round(mag))}s"
                else:
                    delta = _fmt_time(mag)
                sym = '⟪' if float(seconds) < 0 else '⟫'
                self.toast.show_toast(f"{sym} {delta}")
            except Exception:
                pass
        except Exception:
            pass
    
    def _on_seek_requested(self, fraction: float):
        """Handle seek from scrubber."""
        try:
            dur = self._mpv.duration
            if dur and dur > 0:
                target = max(0.0, min(dur, fraction * dur))
                self._mpv.command('seek', str(target), 'absolute')
        except Exception:
            pass
    
    # ========== Volume ==========
    
    def _on_wheel_volume(self, delta: int):
        """Handle wheel volume from render host."""
        try:
            change = 5 if delta > 0 else -5
            self._volume = max(0, min(100, self._volume + change))
            self._mpv.volume = self._volume
            self.volume_hud.show_volume(self._volume)
            self._schedule_save_player_settings()
        except Exception:
            pass
    
    def _toggle_mute(self):
        """Toggle mute."""
        try:
            self._muted = not self._muted
            self._mpv.mute = self._muted
            self.volume_hud.show_volume(0 if self._muted else self._volume)
            self._schedule_save_player_settings()
        except Exception:
            pass
    
    # ========== Speed ==========
    
    def _cycle_speed_preset(self):
        """Cycle through speed presets."""
        try:
            current_idx = self._speed_presets.index(self._speed) if self._speed in self._speed_presets else 3
            next_idx = (current_idx + 1) % len(self._speed_presets)
            self._set_speed(self._speed_presets[next_idx])
        except Exception:
            pass
    
    def _cycle_speed(self, direction: int):
        """Cycle speed by direction."""
        try:
            current_idx = self._speed_presets.index(self._speed) if self._speed in self._speed_presets else 3
            next_idx = max(0, min(len(self._speed_presets) - 1, current_idx + direction))
            self._set_speed(self._speed_presets[next_idx])
        except Exception:
            pass
    
    def _set_speed(self, speed: float):
        """Set playback speed."""
        try:
            self._speed = speed
            self._mpv.speed = speed
            self.bottom_hud.set_speed_label(speed)
            try:
                self.toast.show_toast(f"Speed {speed:.2f}×")
            except Exception:
                pass
        except Exception:
            pass
    
    # ========== Quality ==========
    
    def _cycle_quality(self):
        """Cycle quality modes."""
        try:
            modes = ["Auto", "Balanced", "High", "Extreme"]
            current_idx = modes.index(self._quality_mode) if self._quality_mode in modes else 1
            next_idx = (current_idx + 1) % len(modes)
            self._quality_mode = modes[next_idx]
            self.bottom_hud.set_quality_label(self._quality_mode)
            try:
                self.toast.show_toast("▮" * (3 if str(self._quality_mode).lower().strip() == "high" else 2))
            except Exception:
                pass
            
            # Apply quality settings
            if self._quality_mode == "Auto":
                self._mpv.profile = "gpu-hq"
            elif self._quality_mode == "Balanced":
                self._mpv.profile = "gpu-hq"
            elif self._quality_mode == "High":
                self._mpv.profile = "gpu-hq"
                self._mpv.scale = "ewa_lanczossharp"
            elif self._quality_mode == "Extreme":
                self._mpv.profile = "gpu-hq"
                self._mpv.scale = "ewa_lanczossharp"
                self._mpv.cscale = "ewa_lanczossharp"
        except Exception:
            pass
    

    def _set_quality_mode(self, mode: str):
        """Set a specific quality mode (used by the context menu)."""
        try:
            modes = ["Auto", "Balanced", "High", "Extreme"]
            if mode not in modes:
                return
            self._quality_mode = mode
            try:
                self.bottom_hud.set_quality_label(self._quality_mode)
            except Exception:
                pass
            try:
                # Keep feedback lightweight (top-left toast)
                self.toast.show_toast(f"Quality: {mode}")
            except Exception:
                pass

            # Apply quality settings (mirrors _cycle_quality)
            if self._quality_mode == "Auto":
                self._mpv.profile = "gpu-hq"
            elif self._quality_mode == "Balanced":
                self._mpv.profile = "gpu-hq"
            elif self._quality_mode == "High":
                self._mpv.profile = "gpu-hq"
                self._mpv.scale = "ewa_lanczossharp"
            elif self._quality_mode == "Extreme":
                self._mpv.profile = "gpu-hq"
                self._mpv.scale = "ewa_lanczossharp"
                self._mpv.cscale = "ewa_lanczossharp"
        except Exception:
            pass

    # ========== Info Toggle ==========
    
    def _toggle_info(self):
        """Toggle diagnostics overlay."""
        try:
            self._info_visible = not self._info_visible
            if self._info_visible:
                self.diagnostics.show()
                self.diagnostics.raise_()
            else:
                self.diagnostics.hide()
        except Exception:
            pass
    
    # ========== Fullscreen ==========
    
    def _toggle_fullscreen(self):
        """Toggle fullscreen with a single coalesced transition (minimizes resize shake)."""
        try:
            if getattr(self, "_state_transitioning", False):
                return
            target_fullscreen = not self.isFullScreen()

            if self.isFullScreen():
                # Exit fullscreen -> maximized in one step (avoid intermediate "restore" geometry)
                st = self.windowState()
                st &= ~Qt.WindowState.WindowFullScreen
                st &= ~Qt.WindowState.WindowMinimized
                st |= Qt.WindowState.WindowMaximized
                self._apply_window_state(
                    st,
                    suppress_updates=True,
                    force_show=False,
                    restore_delay_ms=35,
                    clear_delay_ms=280,
                    mark_fs_transition=True,
                )
                # Safety net: ensure we stay maximized after WM settles
                self._schedule_ensure_maximized(140)
            else:
                # Enter fullscreen
                st = self.windowState()
                st &= ~Qt.WindowState.WindowMinimized
                st |= Qt.WindowState.WindowFullScreen
                self._apply_window_state(
                    st,
                    suppress_updates=True,
                    force_show=False,
                    restore_delay_ms=20,
                    clear_delay_ms=220,
                    mark_fs_transition=True,
                )

            # Keep focus/hotkeys stable across fullscreen transitions
            try:
                self.activateWindow()
                self.raise_()
                self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                self.grabKeyboard()
                if hasattr(self, 'render_host') and self.render_host:
                    self.render_host.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            except Exception:
                pass
            try:
                self._emit_ui_event("fullscreen", bool(target_fullscreen))
                self._write_progress(phase="ui")
            except Exception:
                pass
        except Exception:
            pass

    def _toggle_tracks_drawer(self):
        """Toggle embedded-style tracks drawer."""
        try:
            try:
                if getattr(self, 'audio_popover', None):
                    self.audio_popover.close_popover()
                if getattr(self, 'subtitle_popover', None):
                    self.subtitle_popover.close_popover()
            except Exception:
                pass
            self._refresh_track_lists()
            # Close other drawer for cleanliness
            if hasattr(self, 'playlist_drawer') and self.playlist_drawer.is_open():
                self.playlist_drawer.close(self.width())
            self.tracks_drawer.toggle(self.width())
            try:
                self._set_controls_visible(True)
            except Exception:
                pass
            try:
                self._arm_controls_autohide()
            except Exception:
                pass

        except Exception:
            pass

    def _toggle_playlist_drawer(self):
        """Toggle embedded-style playlist drawer."""
        try:
            try:
                if getattr(self, 'audio_popover', None):
                    self.audio_popover.close_popover()
                if getattr(self, 'subtitle_popover', None):
                    self.subtitle_popover.close_popover()
            except Exception:
                pass
            self._populate_playlist_drawer()
            if hasattr(self, 'tracks_drawer') and self.tracks_drawer.is_open():
                self.tracks_drawer.close(self.width())
            self.playlist_drawer.toggle(self.width())
            try:
                self._set_controls_visible(True)
            except Exception:
                pass
            try:
                self._arm_controls_autohide()
            except Exception:
                pass

        except Exception:
            pass

    def _dismiss_overlays_on_click(self) -> bool:
        """If any overlay drawer is open, close it and return True."""
        try:
            dismissed = False
            # Compact popovers
            try:
                if getattr(self, 'audio_popover', None) and self.audio_popover.isVisible():
                    self.audio_popover.close_popover()
                    dismissed = True
                if getattr(self, 'subtitle_popover', None) and self.subtitle_popover.isVisible():
                    self.subtitle_popover.close_popover()
                    dismissed = True
            except Exception:
                pass
            if hasattr(self, 'tracks_drawer') and self.tracks_drawer and self.tracks_drawer.is_open():
                self.tracks_drawer.close(self.width())
                dismissed = True
            if hasattr(self, 'playlist_drawer') and self.playlist_drawer and self.playlist_drawer.is_open():
                self.playlist_drawer.close(self.width())
                dismissed = True

            if dismissed:
                try:
                    self._set_controls_visible(True)
                except Exception:
                    pass
                try:
                    self._arm_controls_autohide()
                except Exception:
                    pass
            return dismissed
        except Exception:
            return False

    def _populate_playlist_drawer(self):
        try:
            episodes = [{'path': p, 'name': Path(p).name} for p in self._playlist]
            self.playlist_drawer.populate_playlist(str(self._show_root_path), episodes, self._playlist_index)
            # Keep checkbox in sync
            try:
                self.playlist_drawer.auto_advance.blockSignals(True)
                self.playlist_drawer.auto_advance.setChecked(bool(self._auto_advance))
                self.playlist_drawer.auto_advance.blockSignals(False)
            except Exception:
                pass
        except Exception:
            pass

    def _show_speed_menu(self):
        """Show a small speed preset menu anchored to the Speed chip."""
        try:
            m = QMenu(self)
            m.setStyleSheet(
                """
                QMenu { background: rgba(12, 12, 12, 0.88); color: rgba(255, 255, 255, 0.92); border: 1px solid rgba(255, 255, 255, 0.12); padding: 6px; }
                QMenu::item { padding: 8px 18px; border-radius: 8px; }
                QMenu::item:selected { background: rgba(255, 255, 255, 0.12); }
                """
            )
            for sp in self._speed_presets:
                a = m.addAction(f"{sp}×")
                a.setCheckable(True)
                a.setChecked(abs(sp - self._speed) < 1e-6)
                a.triggered.connect(lambda checked=False, s=sp: self._set_speed(s))
            m.addSeparator()
            m.addAction("⟲ 1.0×").triggered.connect(lambda: self._set_speed(1.0))

            btn = self.bottom_hud.speed_btn
            pos = btn.mapToGlobal(QPoint(0, btn.height()))
            m.exec(pos)
        except Exception:
            # Fallback to simple cycle
            self._cycle_speed_preset()


    def _show_aspect_menu(self):
        """Show aspect ratio presets anchored to the Aspect chip."""
        try:
            m = QMenu(self)
            m.setStyleSheet(
                """
                QMenu { background: rgba(12, 12, 12, 0.88); color: rgba(255, 255, 255, 0.92); border: 1px solid rgba(255, 255, 255, 0.12); padding: 6px; }
                QMenu::item { padding: 8px 18px; border-radius: 8px; }
                QMenu::item:selected { background: rgba(255, 255, 255, 0.12); }
                """
            )

            # (Label, mpv video_aspect_override value)
            presets = [
                ("⟲", "-1"),
                ("16:9", "16:9"),
                ("4:3", "4:3"),
                ("21:9", "2.33:1"),
                ("2.35:1", "2.35:1"),
                ("1:1", "1:1"),
                ("9:16", "9:16"),
                ("3:2", "3:2"),
            ]

            cur = str(getattr(self._mpv, 'video_aspect_override', '-1') or '-1')
            for label, val in presets:
                a = m.addAction(label)
                a.setCheckable(True)
                a.setChecked(cur == val)
                a.triggered.connect(lambda checked=False, v=val: self._set_aspect_ratio(v))

            btn = getattr(self.bottom_hud, 'aspect_btn', None)
            if btn:
                pos = btn.mapToGlobal(QPoint(0, btn.height()))
                m.exec(pos)
            else:
                m.exec(QCursor.pos())
        except Exception:
            # fallback: cycle between common presets
            try:
                cur = str(getattr(self._mpv, 'video_aspect_override', '-1') or '-1')
                order = ["-1", "16:9", "4:3", "2.35:1"]
                nxt = order[(order.index(cur) + 1) % len(order)] if cur in order else "-1"
                self._set_aspect_ratio(nxt)
            except Exception:
                pass


    def _dismiss_popovers_for_global_click(self, global_pos: QPoint):
        """Close track popovers on outside clicks, but never consume the click."""
        try:
            closed = False

            def inside(w: Optional[QWidget]) -> bool:
                try:
                    return bool(w and w.isVisible() and w.rect().contains(w.mapFromGlobal(global_pos)))
                except Exception:
                    return False

            audio_btn = getattr(self.bottom_hud, 'audio_btn', None)
            sub_btn = getattr(self.bottom_hud, 'subtitle_btn', None)

            ap = getattr(self, 'audio_popover', None)
            if ap and ap.isVisible():
                if not (inside(ap) or inside(audio_btn)):
                    ap.close_popover()
                    closed = True

            sp = getattr(self, 'subtitle_popover', None)
            if sp and sp.isVisible():
                if not (inside(sp) or inside(sub_btn)):
                    sp.close_popover()
                    closed = True

            if closed:
                try:
                    self._set_controls_visible(True)
                except Exception:
                    pass
                try:
                    self._arm_controls_autohide()
                except Exception:
                    pass
        except Exception:
            pass

    def _show_audio_track_popover(self):
        """Quick audio track picker anchored to the Audio chip."""
        try:
            # Close other overlays for clarity
            try:
                if hasattr(self, 'tracks_drawer') and self.tracks_drawer and self.tracks_drawer.is_open():
                    self.tracks_drawer.close(self.width())
                if hasattr(self, 'playlist_drawer') and self.playlist_drawer and self.playlist_drawer.is_open():
                    self.playlist_drawer.close(self.width())
            except Exception:
                pass

            # Toggle behavior
            ap = getattr(self, 'audio_popover', None)
            if ap and ap.isVisible():
                ap.close_popover()
                return
            try:
                if getattr(self, 'subtitle_popover', None):
                    self.subtitle_popover.close_popover()
            except Exception:
                pass

            tl = self._mpv.track_list or []
            cur = getattr(self._mpv, 'aid', None)
            items: List[Tuple[str, int, bool]] = []
            for t in tl:
                try:
                    if t.get('type') != 'audio':
                        continue
                    tid = int(t.get('id'))
                    lang = (t.get('lang') or '').strip()
                    title = (t.get('title') or '').strip()
                    bits = []
                    if lang:
                        bits.append(lang.upper())
                    if title and ((not lang) or (title.lower() != lang.lower())):
                        bits.append(title)
                    label = ' · '.join(bits) if bits else f"Track #{tid}"
                    items.append((label, tid, str(tid) == str(cur)))
                except Exception:
                    continue

            btn = getattr(self.bottom_hud, 'audio_btn', None)
            if ap and btn:
                ap.open_for_button(btn, items)
                self._set_controls_visible(True)
                self._arm_controls_autohide()
        except Exception:
            pass

    def _show_subtitle_track_popover(self):
        """Quick subtitle track picker anchored to the Subtitle chip."""
        try:
            # Close other overlays for clarity
            try:
                if hasattr(self, 'tracks_drawer') and self.tracks_drawer and self.tracks_drawer.is_open():
                    self.tracks_drawer.close(self.width())
                if hasattr(self, 'playlist_drawer') and self.playlist_drawer and self.playlist_drawer.is_open():
                    self.playlist_drawer.close(self.width())
            except Exception:
                pass

            sp = getattr(self, 'subtitle_popover', None)
            if sp and sp.isVisible():
                sp.close_popover()
                return
            try:
                if getattr(self, 'audio_popover', None):
                    self.audio_popover.close_popover()
            except Exception:
                pass

            tl = self._mpv.track_list or []
            cur = getattr(self._mpv, 'sid', None)
            items: List[Tuple[str, int, bool]] = []

            # Off option
            off_selected = (cur in (None, 'no', 0, '0', False))
            items.append(("Off", -1, off_selected))

            for t in tl:
                try:
                    if t.get('type') != 'sub':
                        continue
                    tid = int(t.get('id'))
                    lang = (t.get('lang') or '').strip()
                    title = (t.get('title') or '').strip()
                    bits = []
                    if lang:
                        bits.append(lang.upper())
                    if title and ((not lang) or (title.lower() != lang.lower())):
                        bits.append(title)
                    label = ' · '.join(bits) if bits else f"Sub #{tid}"
                    items.append((label, tid, (not off_selected) and (str(tid) == str(cur))))
                except Exception:
                    continue

            btn = getattr(self.bottom_hud, 'subtitle_btn', None)
            if sp and btn:
                sp.open_for_button(btn, items)
                self._set_controls_visible(True)
                self._arm_controls_autohide()
        except Exception:
            pass

    def _set_auto_advance(self, enabled: bool):
        try:
            self._auto_advance = bool(enabled)
            self.toast.show_toast("Auto-advance on" if self._auto_advance else "Auto-advance off")
        except Exception:
            pass

    def _set_subtitle_style_respect(self, enabled: bool):
        """Respect embedded ASS/SSA styling when enabled."""
        try:
            self._respect_subtitle_styles = bool(enabled)
            # mpv option: sub-ass-override (no/strip/yes)
            if enabled:
                try:
                    self._mpv.sub_ass_override = 'no'
                except Exception:
                    self._mpv.command('set', 'sub-ass-override', 'no')
                self.toast.show_toast("Subtitle styles: embedded")
            else:
                try:
                    self._mpv.sub_ass_override = 'strip'
                except Exception:
                    self._mpv.command('set', 'sub-ass-override', 'strip')
                self.toast.show_toast("Subtitle styles: simplified")
            try:
                self._apply_subtitle_safe_margin()
            except Exception:
                pass
        except Exception:
            pass

    def _toggle_always_on_top(self, checked: bool):
        if getattr(self, "_embedded_mode", False):
            return
        try:
            self._always_on_top = bool(checked)
            self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, self._always_on_top)
            # Re-apply visibility without losing fullscreen
            if self.isFullScreen():
                self.showFullScreen()
            else:
                self.show()
            self.toast.show_toast("Always on top" if self._always_on_top else "Normal window")
        except Exception:
            pass

    def _open_file_dialog(self):
        try:
            fp, _ = QFileDialog.getOpenFileName(
                self,
                "Open video",
                str(self._file_path.parent),
                "Video Files (*.mp4 *.mkv *.avi *.mov *.m4v *.webm *.ts *.m2ts *.wmv *.flv *.mpeg *.mpg *.3gp);;All Files (*.*)"
            )
            if not fp:
                return
            p = Path(fp)
            new_root = p.parent
            same_root = False
            try:
                same_root = bool(self._show_root_path) and Path(self._show_root_path).resolve() == new_root.resolve()
            except Exception:
                same_root = False

            self._file_path = p
            self._show_root_path = new_root

            idx_found = -1
            try:
                p_res = str(p.resolve())
                for i, item in enumerate(self._playlist or []):
                    try:
                        if str(Path(item).resolve()) == p_res:
                            idx_found = i
                            break
                    except Exception:
                        if str(item) == str(p):
                            idx_found = i
                            break
            except Exception:
                idx_found = -1

            if same_root and idx_found >= 0:
                self._playlist_index = idx_found
            else:
                self._build_folder_playlist()
                try:
                    self._playlist_index = self._playlist.index(str(p))
                except Exception:
                    self._playlist_index = 0
                    try:
                        p_res = str(p.resolve())
                        for i, item in enumerate(self._playlist):
                            if str(Path(item).resolve()) == p_res:
                                self._playlist_index = i
                                break
                    except Exception:
                        pass

            self._load_file(p, 0.0)

            # If playlist drawer is open, refresh immediately
            if hasattr(self, 'playlist_drawer') and self.playlist_drawer.is_open():
                self._populate_playlist_drawer()

            self.toast.show_toast("Loaded")
        except Exception:
            pass
    
    # ========== Tracks Panel ==========

    def _open_tracks_focus(self, target: str):
        """Open tracks drawer and focus a specific control."""
        try:
            self._refresh_track_lists()
            # Close other drawer for cleanliness
            if hasattr(self, 'playlist_drawer') and self.playlist_drawer.is_open():
                self.playlist_drawer.close(self.width())

            if not self.tracks_drawer.is_open():
                self.tracks_drawer.open(self.width())
            else:
                self.tracks_drawer.raise_()

            # Focus the requested section
            if target == "audio":
                self.tracks_drawer.audio_list.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            elif target == "subtitles":
                self.tracks_drawer.subtitle_list.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            elif target == "audio_delay":
                self.tracks_drawer.audio_delay_spin.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            elif target == "subtitle_delay":
                self.tracks_drawer.subtitle_delay_spin.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
            elif target == "aspect":
                btn = None
                try:
                    btn = self.tracks_drawer._aspect_group.checkedButton()
                except Exception:
                    btn = None
                if not btn:
                    try:
                        bs = self.tracks_drawer._aspect_group.buttons()
                        btn = bs[0] if bs else None
                    except Exception:
                        btn = None
                if btn:
                    btn.setFocus(Qt.FocusReason.ActiveWindowFocusReason)

            # Keep focus/hotkeys stable
            try:
                self.activateWindow()
                self.raise_()
                self.setFocus(Qt.FocusReason.ActiveWindowFocusReason)
                self.grabKeyboard()
            except Exception:
                pass
        except Exception:
            pass

    def _show_audio_tracks_panel(self):
        try:
            self._open_tracks_focus("audio")
        except Exception:
            pass

    def _show_subtitle_tracks_panel(self):
        try:
            self._open_tracks_focus("subtitles")
        except Exception:
            pass

    def _show_audio_delay_panel(self):
        try:
            self._open_tracks_focus("audio_delay")
        except Exception:
            pass

    def _show_subtitle_delay_panel(self):
        try:
            self._open_tracks_focus("subtitle_delay")
        except Exception:
            pass

    def _show_aspect_ratio_panel(self):
        try:
            self._open_tracks_focus("aspect")
        except Exception:
            pass
    
    def _show_tracks_panel(self):
        """Show tracks drawer (compat)."""
        try:
            self._toggle_tracks_drawer()
        except Exception:
            pass
    
    def _refresh_track_lists(self):
        """Refresh track lists from MPV."""
        try:
            # Audio tracks
            audio_tracks = []
            current_aid = self._mpv.aid
            track_list = self._mpv.track_list or []
            
            for track in track_list:
                if track.get('type') == 'audio':
                    audio_tracks.append({
                        'id': track.get('id'),
                        'lang': track.get('lang', 'und'),
                        'title': track.get('title', ''),
                        'selected': track.get('id') == current_aid,
                    })
            
            self.tracks_drawer.populate_audio_tracks(audio_tracks)
            
            # Subtitle tracks
            subtitle_tracks = []
            current_sid = self._mpv.sid
            
            for track in track_list:
                if track.get('type') == 'sub':
                    subtitle_tracks.append({
                        'id': track.get('id'),
                        'lang': track.get('lang', 'und'),
                        'title': track.get('title', ''),
                        'selected': track.get('id') == current_sid,
                    })
            
            self.tracks_drawer.populate_subtitle_tracks(subtitle_tracks)
            
        except Exception as e:
            print(f"Refresh track lists error: {e}")
    
    def _select_audio_track(self, track_id: int):
        """Select audio track."""
        try:
            try:
                self._suppress_next_aid_toast = True
            except Exception:
                pass
            self._mpv.aid = track_id
            try:
                label = self._format_audio_track_label(track_id)
                self.toast.show_toast(f"♪ {label}" if label else '♪')
            except Exception:
                pass
            try:
                self._refresh_track_lists()
            except Exception:
                pass
        except Exception:
            pass
    
    def _select_subtitle_track(self, track_id: int):
        """Select subtitle track (-1 for none)."""
        try:
            try:
                self._suppress_next_sid_toast = True
            except Exception:
                pass
            if track_id == -1:
                self._mpv.sid = 'no'
                try:
                    self.toast.show_toast('CC ⦸')
                except Exception:
                    pass
            else:
                self._mpv.sid = track_id
                try:
                    label = self._format_subtitle_track_label(track_id)
                    self.toast.show_toast(f"CC {label}" if label else 'CC')
                except Exception:
                    pass
            try:
                self._refresh_track_lists()
            except Exception:
                pass
        except Exception:
            pass
    
    def _load_external_subtitle(self):
        """Load external subtitle file."""
        try:
            file_path, _ = QFileDialog.getOpenFileName(
                self,
                "Select Subtitle File",
                str(self._file_path.parent),
                "Subtitle Files (*.srt *.ass *.ssa *.sub);;All Files (*.*)"
            )
            if file_path:
                self._mpv.command('sub-add', file_path)
                self._refresh_track_lists()
                try:
                    self.toast.show_toast("Subtitle loaded")
                except Exception:
                    pass
        except Exception as e:
            print(f"Load external subtitle error: {e}")
    
    def _set_audio_delay(self, delay: float):
        """Set audio delay."""
        try:
            self._mpv.audio_delay = delay
        except Exception:
            pass
    
    def _set_subtitle_delay(self, delay: float):
        """Set subtitle delay."""
        try:
            self._mpv.sub_delay = delay
        except Exception:
            pass

    def _set_subtitle_hud_lift(self, px: int):
        """Adjust extra subtitle lift while the timeline HUD is visible."""
        try:
            v = int(px)
        except Exception:
            v = 40
        v = max(0, min(300, v))
        self._subtitle_hud_lift_px = v
        try:
            self._apply_subtitle_safe_margin()
        except Exception:
            pass
        try:
            self._schedule_save_player_settings()
        except Exception:
            pass
    
    def _set_aspect_ratio(self, ratio: str):
        """Set aspect ratio."""
        try:
            self._mpv.video_aspect_override = ratio
            try:
                if ratio == "-1":
                    self.toast.show_toast("▭ ⟲")
                else:
                    self.toast.show_toast(f"▭ {ratio}")
            except Exception:
                pass
        except Exception:
            pass
    
    # ========== Playlist Panel ==========
    
    def _show_playlist_panel(self):
        """Show playlist drawer (compat)."""
        try:
            self._toggle_playlist_drawer()
        except Exception:
            pass
    
    def _next_episode(self):
        """Load next episode."""
        try:
            if self._playlist_index < len(self._playlist) - 1:
                self._load_episode_at_index(self._playlist_index + 1)
        except Exception:
            pass
    
    def _prev_episode(self):
        """Load previous episode."""
        try:
            if self._playlist_index > 0:
                self._load_episode_at_index(self._playlist_index - 1)
        except Exception:
            pass
    
    # ========== Context Menu ==========
    

    def _show_context_menu(self, global_pos: QPoint):
        """Show context menu at position (text labels; HUD stays symbol-only)."""
        try:
            menu = QMenu(self)
            menu.setStyleSheet(
                """
                QMenu {
                    background: rgba(12, 12, 12, 0.88);
                    color: rgba(255, 255, 255, 0.92);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px;
                }
                QMenu::item {
                    padding: 8px 18px;
                    border-radius: 8px;
                }
                QMenu::item:selected {
                    background: rgba(255, 255, 255, 0.12);
                }
                QMenu::separator {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.08);
                    margin: 6px 6px;
                }
                """
            )

            menu.addAction("Open File…").triggered.connect(self._open_file_dialog)
            menu.addSeparator()

            playback_m = menu.addMenu("Playback")
            paused = bool(getattr(self._mpv, 'pause', False))
            playback_m.addAction("Pause" if not paused else "Play").triggered.connect(self._toggle_play_pause)
            playback_m.addAction("Stop").triggered.connect(lambda: self._mpv.command('stop'))
            playback_m.addAction("Restart from Beginning").triggered.connect(lambda: self._mpv.command('seek', '0', 'absolute'))

            # Seek submenu
            seek_m = playback_m.addMenu("Seek")
            seek_m.addAction("Back 10 seconds").triggered.connect(lambda: self._seek_relative(-10))
            seek_m.addAction("Back 30 seconds").triggered.connect(lambda: self._seek_relative(-30))
            seek_m.addAction("Forward 10 seconds").triggered.connect(lambda: self._seek_relative(10))
            seek_m.addAction("Forward 30 seconds").triggered.connect(lambda: self._seek_relative(30))

            # Speed submenu
            sp_m = playback_m.addMenu("Speed")
            for sp in self._speed_presets:
                a = sp_m.addAction(f"{sp}×")
                a.setCheckable(True)
                a.setChecked(abs(float(sp) - float(self._speed)) < 1e-6)
                a.triggered.connect(lambda checked=False, s=sp: self._set_speed(s))
            sp_m.addSeparator()
            sp_m.addAction("Reset to 1.0×").triggered.connect(lambda: self._set_speed(1.0))

            # Aspect submenu
            video_m = menu.addMenu("Video")
            ar_m = video_m.addMenu("Aspect Ratio")
            presets = [
                ("Default", "-1"),
                ("16:9", "16:9"),
                ("4:3", "4:3"),
                ("21:9", "2.33:1"),
                ("2.35:1", "2.35:1"),
                ("1:1", "1:1"),
                ("9:16", "9:16"),
                ("3:2", "3:2"),
            ]
            for label, val in presets:
                ar_m.addAction(label).triggered.connect(lambda checked=False, v=val: self._set_aspect_ratio(v))

            # Quality (kept, but moved off the HUD bar)
            q_m = video_m.addMenu("Quality")
            modes = ["Auto", "Balanced", "High", "Extreme"]
            cur_mode = str(getattr(self, '_quality_mode', 'Balanced') or 'Balanced')
            for mname in modes:
                a = q_m.addAction(mname)
                a.setCheckable(True)
                a.setChecked(str(mname) == cur_mode)
                a.triggered.connect(lambda checked=False, mn=mname: self._set_quality_mode(mn))
            q_m.addSeparator()
            q_m.addAction("Cycle").triggered.connect(self._cycle_quality)

            video_m.addAction("Fullscreen").triggered.connect(self._toggle_fullscreen)

            # Audio/Subtitle quick pickers (text labels)
            tl = getattr(self._mpv, 'track_list', None) or []
            cur_aid = getattr(self._mpv, 'aid', None)
            cur_sid = getattr(self._mpv, 'sid', None)

            audio_m = menu.addMenu("Audio")
            aud_m = audio_m.addMenu("Audio Track")
            audio_tracks = [t for t in tl if isinstance(t, dict) and t.get('type') == 'audio']
            if not audio_tracks:
                na = aud_m.addAction("(No audio tracks)")
                na.setEnabled(False)
            else:
                for t in audio_tracks:
                    try:
                        tid = int(t.get('id'))
                        lang = (t.get('lang') or '').strip()
                        title = (t.get('title') or '').strip()
                        parts = []
                        if lang:
                            parts.append(lang.upper())
                        if title and ((not lang) or (title.lower() != lang.lower())):
                            parts.append(title)
                        txt = " · ".join(parts) if parts else f"Track #{tid}"
                        a = aud_m.addAction(txt)
                        a.setCheckable(True)
                        a.setChecked(str(tid) == str(cur_aid))
                        a.triggered.connect(lambda checked=False, x=tid: self._select_audio_track(x))
                    except Exception:
                        continue

            subtitle_m = menu.addMenu("Subtitles")
            sub_m = subtitle_m.addMenu("Subtitle Track")
            off = sub_m.addAction("Off")
            off.setCheckable(True)
            off.setChecked(cur_sid in (None, 'no', 0, '0', False))
            off.triggered.connect(lambda: self._select_subtitle_track(-1))

            sub_tracks = [t for t in tl if isinstance(t, dict) and t.get('type') == 'sub']
            if not sub_tracks:
                ns = sub_m.addAction("(No subtitles)")
                ns.setEnabled(False)
            else:
                for t in sub_tracks:
                    try:
                        tid = int(t.get('id'))
                        lang = (t.get('lang') or '').strip()
                        title = (t.get('title') or '').strip()
                        parts = []
                        if lang:
                            parts.append(lang.upper())
                        if title and ((not lang) or (title.lower() != lang.lower())):
                            parts.append(title)
                        txt = " · ".join(parts) if parts else f"Sub #{tid}"
                        a = sub_m.addAction(txt)
                        a.setCheckable(True)
                        a.setChecked(str(tid) == str(cur_sid))
                        a.triggered.connect(lambda checked=False, x=tid: self._select_subtitle_track(x))
                    except Exception:
                        continue

            adv_m = menu.addMenu("Filters / Advanced")
            info_a = adv_m.addAction("Show Info")
            info_a.setCheckable(True)
            info_a.setChecked(bool(getattr(self, '_info_visible', False)))
            info_a.triggered.connect(self._toggle_info)

            adv_m.addAction("Take Screenshot").triggered.connect(self._take_screenshot)

            aot = adv_m.addAction("Always on Top")
            aot.setCheckable(True)
            aot.setChecked(bool(getattr(self, '_always_on_top', False)))
            aot.triggered.connect(self._toggle_always_on_top)

            # Playlist
            playlist_m = menu.addMenu("Playlist")
            prev_a = playlist_m.addAction("Previous Episode")
            prev_a.setEnabled(self._playlist_index > 0)
            prev_a.triggered.connect(self._prev_episode)

            next_a = playlist_m.addAction("Next Episode")
            next_a.setEnabled(self._playlist_index < len(self._playlist) - 1)
            next_a.triggered.connect(self._next_episode)

            playlist_m.addAction("Playlist…").triggered.connect(self._toggle_playlist_drawer)

            menu.exec(global_pos)

        except Exception as e:
            print(f"Context menu error: {e}")

    def _nudge_audio_delay(self, amount: float):
        """Nudge audio delay."""
        try:
            current = self._mpv.audio_delay or 0.0
            self._set_audio_delay(current + amount)
        except Exception:
            pass
    
    def _nudge_subtitle_delay(self, amount: float):
        """Nudge subtitle delay."""
        try:
            current = self._mpv.sub_delay or 0.0
            self._set_subtitle_delay(current + amount)
        except Exception:
            pass
    
    def _take_screenshot(self):
        """Take screenshot."""
        try:
            self._mpv.command('screenshot')
        except Exception:
            pass
    
    # ========== Chapter Navigation ==========
    
    def _navigate_chapter(self, direction: int):
        """Navigate chapters."""
        try:
            self._mpv.command('add', 'chapter', str(direction))
        except Exception:
            pass

    def _emit_ui_event(self, event_type: str, value=None):
        """Publish lightweight UI events to the main app via the session progress file."""
        try:
            self._ui_event_seq = int(getattr(self, "_ui_event_seq", 0) or 0) + 1
            self._last_ui_event = {
                "id": int(self._ui_event_seq),
                "type": str(event_type or "").strip().lower(),
                "value": value,
                "ts": time.time(),
            }
        except Exception:
            pass
    
    # ========== Back ==========
    
    def _on_back(self):
        """Return to library without terminating the player process."""
        try:
            self._emit_ui_event("back", True)
            self._write_progress(phase="back")
        except Exception:
            pass
        try:
            self._mpv.pause = True
        except Exception:
            pass
        try:
            self.showMinimized()
        except Exception:
            pass
    
    # ========== Resume After Buffer ==========
    
    def _resume_after_buffer(self):
        """Resume playback after buffering."""
        try:
            if self._mpv.pause:
                self._mpv.pause = False
        except Exception:
            pass
    
    # ========== Progress Tracking ==========
    
    def _write_progress(self, phase: str):
        """Write progress to file."""
        try:
            if not self._progress_file:
                return
            
            now = time.time()
            if phase == "periodic" and (now - self._last_progress_write) < 4.0:
                return
            
            self._last_progress_write = now
            
            # Use cached values from mpv observers; avoid polling mpv properties on the Qt thread.
            pos = getattr(self, "_last_time_pos", None)
            dur = getattr(self, "_last_duration", None)

            # Build 19: avoid writing 0 on close if mpv resets time-pos during shutdown
            try:
                pos_f = float(pos) if pos is not None else None
            except Exception:
                pos_f = None
            try:
                dur_f = float(dur) if dur is not None else 0.0
            except Exception:
                dur_f = 0.0

            if pos_f is None:
                pos_f = float(self._last_time_pos or 0.0)
            else:
                # For close/eof, prefer last observed position if mpv reports 0.
                if phase in ("close", "eof") and pos_f <= 0.1 and (self._last_time_pos or 0.0) > 0.1:
                    pos_f = float(self._last_time_pos)

            pos = pos_f if pos_f is not None else 0.0
            dur = dur_f
            
            progress = {
                "videoId": self._video_id,
                "showId": self._show_id,
                "sessionId": self._session_id,
                "position": pos,
                "duration": dur,
                "maxPosition": self._max_position,
                "watchedTime": self._watched_time,
                "finished": _finished(pos, dur, self._max_position, self._watched_time, self._eof_signaled),
                "timestamp": now,
                "phase": phase,
                "windowFullscreen": bool(self.isFullScreen()),
            }

            try:
                ui_event = getattr(self, "_last_ui_event", None)
                if isinstance(ui_event, dict) and ui_event.get("type"):
                    progress["uiEvent"] = ui_event
            except Exception:
                pass

            # BUILD22: Persist last chosen tracks so preferences carry across sessions (best-effort)
            try:
                aid = getattr(self, "_last_aid", None)
                sid = getattr(self, "_last_sid", None)
                sub_vis = getattr(self, "_last_sub_visibility", None)
                if aid is not None:
                    progress["aid"] = aid
                if sid is not None:
                    progress["sid"] = sid
                if sub_vis is not None:
                    progress["subVisibility"] = bool(sub_vis)
            except Exception:
                pass
            
            atomic_write_json(self._progress_file, progress)
            
        except Exception as e:
            print(f"Write progress error: {e}")
    
    # ========== Key Handling ==========
    
    def keyPressEvent(self, event):
        """Handle keyboard input."""
        if self._handle_key_event(event):
            return
        return super().keyPressEvent(event)
    
    def _handle_key_event(self, event) -> bool:
        """Handle key press event."""
        try:
            key = event.key()
            mods = event.modifiers()
            
            # Back
            if key == Qt.Key.Key_Backspace:
                self._on_back()
                return True
            
            # Escape
            if key == Qt.Key.Key_Escape:
                if self.isFullScreen():
                    self._toggle_fullscreen()
                    return True
                self._set_controls_visible(False)
                return True
            
            # Play/pause
            if key in (Qt.Key.Key_Space, Qt.Key.Key_K):
                self._toggle_play_pause()
                return True
            
            # Seek
            if key in (Qt.Key.Key_Left, Qt.Key.Key_Right):
                direction = -1 if key == Qt.Key.Key_Left else 1
                big = bool(mods & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.ShiftModifier | Qt.KeyboardModifier.MetaModifier))
                self._seek_relative(direction * (30 if big else 10))
                return True
            
            # J/L for 10s seek
            if key == Qt.Key.Key_J:
                self._seek_relative(-10)
                return True
            if key == Qt.Key.Key_L and not (mods & Qt.KeyboardModifier.AltModifier):
                self._seek_relative(10)
                return True
            
            # Volume
            if key == Qt.Key.Key_Up:
                self._volume = min(100, self._volume + 5)
                self._mpv.volume = self._volume
                self.volume_hud.show_volume(self._volume)
                self._schedule_save_player_settings()
                return True
            if key == Qt.Key.Key_Down:
                self._volume = max(0, self._volume - 5)
                self._mpv.volume = self._volume
                self.volume_hud.show_volume(self._volume)
                self._schedule_save_player_settings()
                return True
            if key == Qt.Key.Key_M:
                self._toggle_mute()
                return True
            
            # Fullscreen
            if key in (Qt.Key.Key_Enter, Qt.Key.Key_Return, Qt.Key.Key_F):
                self._toggle_fullscreen()
                return True
            
            # Speed
            if key in (Qt.Key.Key_C, Qt.Key.Key_BracketRight):
                self._cycle_speed(+1)
                return True
            if key in (Qt.Key.Key_X, Qt.Key.Key_BracketLeft):
                self._cycle_speed(-1)
                return True
            if key in (Qt.Key.Key_Z, Qt.Key.Key_Backslash):
                self._set_speed(1.0)
                return True
            
            # Tracks
            if key == Qt.Key.Key_A and not (mods & Qt.KeyboardModifier.AltModifier):
                self._mpv.command("cycle", "aid")
                return True
            if key == Qt.Key.Key_S and not (mods & Qt.KeyboardModifier.AltModifier):
                self._mpv.command("cycle", "sid")
                return True
            
            # Alt track keys
            if (mods & Qt.KeyboardModifier.AltModifier) and key == Qt.Key.Key_A:
                self._mpv.command("cycle", "aid")
                return True
            if (mods & Qt.KeyboardModifier.AltModifier) and key == Qt.Key.Key_L:
                self._mpv.command("cycle", "sid")
                return True
            if (mods & Qt.KeyboardModifier.AltModifier) and key == Qt.Key.Key_H:
                self._mpv.command("cycle", "sub-visibility")
                return True
            
            # Subtitle delay
            if key == Qt.Key.Key_Greater:
                self._nudge_subtitle_delay(+0.1)
                return True
            if key == Qt.Key.Key_Less:
                self._nudge_subtitle_delay(-0.1)
                return True
            if key == Qt.Key.Key_Slash:
                self._set_subtitle_delay(0)
                return True
            
            # Chapter navigation (Shift+N/P)
            if (mods & Qt.KeyboardModifier.ShiftModifier):
                if key == Qt.Key.Key_N:
                    self._navigate_chapter(1)
                    return True
                if key == Qt.Key.Key_P:
                    self._navigate_chapter(-1)
                    return True
            
            # Episode navigation (N/P without shift)
            if not (mods & Qt.KeyboardModifier.ShiftModifier):
                if key == Qt.Key.Key_N:
                    self._next_episode()
                    return True
                if key == Qt.Key.Key_P:
                    self._prev_episode()
                    return True
            
            # Go to time
            if key == Qt.Key.Key_G:
                self._prompt_goto_time()
                return True
            
            return False
            
        except Exception:
            return False
    
    def _prompt_goto_time(self):
        """Prompt for goto time."""
        try:
            txt, ok = QInputDialog.getText(self, "Go to Time", "Enter time (seconds, mm:ss, or hh:mm:ss):")
            if not ok:
                return
            t = self._parse_time_input(txt)
            if t is None:
                return
            self._mpv.command("seek", str(t), "absolute")
        except Exception:
            pass
    
    def _parse_time_input(self, s: str) -> Optional[float]:
        """Parse time input."""
        try:
            st = str(s or "").strip()
            if not st:
                return None
            if st.isdigit():
                return float(st)
            parts = st.split(":")
            parts = [int(p) for p in parts]
            if len(parts) == 2:
                m, sec = parts
                return float(m * 60 + sec)
            if len(parts) == 3:
                h, m, sec = parts
                return float(h * 3600 + m * 60 + sec)
            return None
        except Exception:
            return None
    
    # ========== Cleanup ==========
    
    def closeEvent(self, event):
        """Handle window close."""
        try:
            self._progress_timer.stop()
            self._ui_timer.stop()
            self._hide_controls_timer.stop()
            self._resume_timer.stop()
        except Exception:
            pass

        # Best-effort progress write
        try:
            self._write_progress(phase="close")
        except Exception:
            pass

        # Best-effort settings write (volume/mute)
        try:
            self._save_player_settings()
        except Exception:
            pass

        # Quit mpv off the Qt thread (prevents 'Not Responding' if libmpv hangs during shutdown)
        try:
            mpv_obj = getattr(self, "_mpv", None)
            if mpv_obj:
                def _quit_mpv():
                    try:
                        mpv_obj.command("quit")
                    except Exception:
                        pass
                    try:
                        mpv_obj.terminate()
                    except Exception:
                        pass
                threading.Thread(target=_quit_mpv, daemon=True).start()
        except Exception:
            pass

        return super().closeEvent(event)


# ============================================================================
# Main
# ============================================================================


def _build_multi_size_icon_from_png(png_path: Path) -> Optional[QIcon]:
    """Build a multi-resolution QIcon from a PNG so Windows can pick the right taskbar size."""
    try:
        pm = QPixmap(str(png_path))
        if pm.isNull():
            return None
        icon = QIcon()
        for s in (16, 20, 24, 32, 40, 48, 64, 128, 256):
            try:
                icon.addPixmap(pm.scaled(s, s, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            except Exception:
                pass
        return icon
    except Exception:
        return None


def load_app_icon() -> Optional[QIcon]:
    """Locate and build the best available app icon."""
    try:
        icon_dir = Path(__file__).resolve().parent
        candidates = [
            icon_dir / "luffy_app_icon.png",
            icon_dir / "luffy_app_icon.ico",
            icon_dir / "luffy.png",
            icon_dir / "luffy.ico",
            icon_dir / "icon.png",
            icon_dir / "icon.ico",
            icon_dir.parent / "build" / "icon.png",
            icon_dir.parent / "build" / "icon.ico",
        ]

        # Prefer PNG -> build multi-size icon for Windows taskbar reliability
        for p in candidates:
            if p.exists() and p.suffix.lower() == ".png":
                ic = _build_multi_size_icon_from_png(p)
                if ic is not None and (not ic.isNull()):
                    return ic

        for p in candidates:
            if p.exists():
                ic = QIcon(str(p))
                if not ic.isNull():
                    return ic
    except Exception:
        return None
    return None


def _apply_taskbar_icon(w: QMainWindow, icon: QIcon, tries: int = 0) -> None:
    """Force the native window handle to pick up the icon (helps Windows taskbar)."""
    try:
        wh = w.windowHandle()
        if wh is None:
            if tries < 12:
                QTimer.singleShot(50, lambda: _apply_taskbar_icon(w, icon, tries + 1))
            return
        try:
            wh.setIcon(icon)
        except Exception:
            pass
    except Exception:
        pass



def main() -> int:
    """Build 13 main entry point."""
    a = parse_args()
    
    # Windows: set explicit AppUserModelID so the taskbar groups/icons correctly
    if sys.platform.startswith("win"):
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Tankoban.Player")
        except Exception:
            pass

    app = QApplication(sys.argv)
    try:
        app.setApplicationName("Tankoban Player")
        app.setApplicationDisplayName("Tankoban Player")
    except Exception:
        pass

    # Single-instance IPC (Qt local socket/server). If another player is running in this session,
    # send it the open command and exit immediately.
    _server_name = _ipc_server_name(getattr(a, "session_id", ""))
    _ipc_payload = {
        "cmd": "open",
        "file": getattr(a, "file_path", ""),
        "start": float(getattr(a, "start_seconds", 0.0) or 0.0),
        "title": getattr(a, "title", ""),
        "playlist_file": getattr(a, "playlist_file", ""),
        "playlist_index": int(getattr(a, "playlist_index", -1) or -1),
        "show_root_path": getattr(a, "show_root_path", ""),
        "video_id": getattr(a, "video_id", ""),
        "show_id": getattr(a, "show_id", ""),
        "progress_file": getattr(a, "progress_file", ""),
        "command_file": getattr(a, "command_file", ""),
        "session_id": getattr(a, "session_id", ""),
        "pref_aid": getattr(a, "pref_aid", ""),
        "pref_sid": getattr(a, "pref_sid", ""),
        "pref_sub_visibility": getattr(a, "pref_sub_visibility", ""),
    }

    if _try_send_ipc_open(_server_name, _ipc_payload):
        return 0

    _ipc_server = _start_ipc_server(_server_name, parent=app)

    # Set app/window icon (Windows taskbar + window)
    _icon = None
    try:
        _icon = load_app_icon()
        if _icon is not None and (not _icon.isNull()):
            app.setWindowIcon(_icon)
            try:
                QGuiApplication.setWindowIcon(_icon)
            except Exception:
                pass
    except Exception:
        _icon = None
    
    try:
        w = PlayerWindow(
            file_path=a.file_path,
            start_seconds=a.start_seconds,
            progress_file=a.progress_file,
            session_id=a.session_id,
            title=a.title,
            video_id=a.video_id,
            show_id=a.show_id,
            playlist_file=a.playlist_file,
            playlist_index=a.playlist_index,
            show_root_path=a.show_root_path,
            command_file=getattr(a, 'command_file', ''),
            pref_aid=getattr(a, 'pref_aid', ''),
            pref_sid=getattr(a, 'pref_sid', ''),
            pref_sub_visibility=getattr(a, 'pref_sub_visibility', ''),
        )
        try:
            if int(getattr(a, "parent_hwnd", 0) or 0) > 0:
                w.attach_to_parent_hwnd(int(a.parent_hwnd))
        except Exception:
            pass

        # Hook up IPC server to this window (single-instance switching)
        try:
            if '_ipc_server' in locals() and _ipc_server is not None:
                _attach_ipc_server_to_window(_ipc_server, w)
        except Exception:
            pass

        # Apply window icon as well (especially important on Windows)
        try:
            if _icon is not None and (not _icon.isNull()):
                w.setWindowIcon(_icon)
        except Exception:
            pass

        # Build16: start windowed by default and (if provided) match Tankoban window geometry
        try:
            if a.win_w and a.win_h:
                w.setGeometry(int(a.win_x or 100), int(a.win_y or 100), int(a.win_w), int(a.win_h))
            else:
                w.resize(1100, 700)
        except Exception:
            try: w.resize(1100, 700)
            except Exception: pass
        try:
            if int(getattr(a, "parent_hwnd", 0) or 0) > 0:
                w.show()
            elif getattr(a, "start_fullscreen", False):
                w.showFullScreen()
            else:
                w.showMaximized()
        except Exception:
            w.show()

        # Foreground pass for fullscreen launches (single deferred call to avoid startup flicker).
        try:
            if int(getattr(a, "parent_hwnd", 0) or 0) <= 0 and bool(getattr(a, "start_fullscreen", False)):
                QTimer.singleShot(140, lambda: w._bring_to_front(ensure_maximized=False))
        except Exception:
            pass


        # Windows: make sure the taskbar picks up the icon (Qt sometimes needs the native handle)
        try:
            if _icon is not None and (not _icon.isNull()):
                QTimer.singleShot(0, lambda: _apply_taskbar_icon(w, _icon, 0))
        except Exception:
            pass

        return app.exec()
    except Exception as e:
        print(f"QT_PLAYER_BUILD13_FEATURE_ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__": raise SystemExit(main())
