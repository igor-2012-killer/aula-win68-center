//! Low-level HID transport for the Aula vendor control collection.
//!
//! Deliberately free of Tauri, logging and app state so the same code can be
//! used by the GUI, the integration tests and the standalone `aula-probe`
//! tool in `tools/probe`. Callers are responsible for logging; the link only
//! reports failures by dropping the handle (see [`Link::is_open`]).

use std::thread;
use std::time::{Duration, Instant};

use hidapi::{DeviceInfo, HidApi, HidDevice};

use crate::protocol::{self as p, PACKET_LEN};

pub const VENDOR_ID: u16 = 0x1CA2;
pub const PRODUCT_ID: u16 = 0x1901;
pub const USAGE_PAGE: u16 = 0xFFA0;
pub const USAGE: u16 = 0x0001;

const WRITE_SETTLE: Duration = Duration::from_millis(6);
pub const QUERY_TIMEOUT: Duration = Duration::from_millis(250);

/// The vendor control collection is a separate HID interface from the keyboard
/// itself, so opening it never interferes with normal typing.
pub fn matches_vendor(info: &DeviceInfo) -> bool {
    info.vendor_id() == VENDOR_ID
        && info.product_id() == PRODUCT_ID
        && info.usage_page() == USAGE_PAGE
        && info.usage() == USAGE
}

/// An open handle to the keyboard's vendor control collection.
#[derive(Default)]
pub struct Link {
    device: Option<HidDevice>,
}

impl Link {
    pub fn is_open(&self) -> bool {
        self.device.is_some()
    }

    /// Is the collection currently visible to Windows?
    ///
    /// This is the only reliable disconnect test: after a polling-rate change
    /// the keyboard stops answering queries without reporting an error, but it
    /// also disappears from enumeration for about a second.
    pub fn is_present(api: &mut HidApi) -> bool {
        let _ = api.refresh_devices();
        api.device_list().any(matches_vendor)
    }

    pub fn open(&mut self, api: &mut HidApi) -> bool {
        self.close();
        let _ = api.refresh_devices();
        // Collect first: `open_device` needs `&HidApi` while `device_list`
        // borrows it immutably for the whole iterator.
        let candidates: Vec<DeviceInfo> = api
            .device_list()
            .filter(|d| matches_vendor(d))
            .cloned()
            .collect();
        for info in candidates {
            if let Ok(device) = info.open_device(api) {
                let _ = device.set_blocking_mode(false);
                self.device = Some(device);
                return true;
            }
        }
        false
    }

    pub fn close(&mut self) {
        if let Some(device) = self.device.take() {
            drop(device);
        }
    }

    /// Drop any stale replies so a query never reads a previous answer.
    fn drain(device: &HidDevice) {
        let mut scratch = [0u8; PACKET_LEN];
        for _ in 0..64 {
            match device.read(&mut scratch) {
                Ok(n) if n > 0 => continue,
                _ => return,
            }
        }
    }

    /// Fire-and-forget packet. Drops the handle if the write fails.
    pub fn send(&mut self, packet: [u8; PACKET_LEN]) -> bool {
        let Some(device) = self.device.as_ref() else {
            return false;
        };
        Self::drain(device);
        thread::sleep(Duration::from_micros(300));
        let mut framed = [0u8; PACKET_LEN + 1];
        framed[1..].copy_from_slice(&packet);
        if device.write(&framed).is_err() {
            self.close();
            return false;
        }
        thread::sleep(WRITE_SETTLE);
        true
    }

    /// Send a packet and wait for a single 64-byte reply.
    pub fn query(&mut self, packet: [u8; PACKET_LEN]) -> Option<p::Response> {
        self.query_multi(packet, PACKET_LEN).map(|raw| {
            let mut bytes = [0u8; PACKET_LEN];
            bytes.copy_from_slice(&raw[..PACKET_LEN]);
            p::Response(bytes)
        })
    }

    /// Send a packet and accumulate up to `want` bytes of reply.
    pub fn query_multi(&mut self, packet: [u8; PACKET_LEN], want: usize) -> Option<Vec<u8>> {
        if !self.send(packet) {
            return None;
        }
        let device = self.device.as_ref()?;
        let mut out: Vec<u8> = Vec::with_capacity(want);
        let deadline = Instant::now() + QUERY_TIMEOUT;
        let mut scratch = [0u8; PACKET_LEN];
        while Instant::now() < deadline && out.len() < want {
            match device.read(&mut scratch) {
                Ok(n) if n > 0 => {
                    out.extend_from_slice(&scratch[..n.min(scratch.len())]);
                    if out.len() >= want {
                        break;
                    }
                }
                _ => thread::sleep(Duration::from_millis(1)),
            }
        }
        (!out.is_empty()).then_some(out)
    }

    /// Convenience wrapper: send a single-value command and return its reply if
    /// the firmware echoed the command id we asked about.
    pub fn query_order(&mut self, cmd: u8) -> Option<p::Response> {
        self.query(p::cmd_packet(cmd, None))
            .filter(|r| r.matches_order(cmd))
    }
}

impl Drop for Link {
    fn drop(&mut self) {
        self.close();
    }
}
