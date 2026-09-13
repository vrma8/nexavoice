'use client';

import { useState, useEffect, useCallback } from 'react';
import { IMicrophoneAudioTrack } from 'agora-rtc-react';
import { Settings, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MicrophoneSelectorProps {
  localMicrophoneTrack: IMicrophoneAudioTrack | null;
}

interface MicrophoneDevice {
  deviceId: string;
  label: string;
}

export function MicrophoneSelector({
  localMicrophoneTrack,
}: MicrophoneSelectorProps) {
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  const fetchMicrophones = useCallback(async () => {
    try {
      const AgoraRTC = (await import('agora-rtc-react')).default;
      const microphones = await AgoraRTC.getMicrophones();

      const formattedDevices = microphones.map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 5)}...`,
      }));

      setDevices(formattedDevices);

      if (localMicrophoneTrack) {
        const currentLabel = localMicrophoneTrack.getTrackLabel();
        const currentDevice = microphones.find(
          (device) => device.label === currentLabel
        );
        if (currentDevice) {
          setCurrentDeviceId(currentDevice.deviceId);
        }
      }
    } catch (error) {
      console.error('Error fetching microphones:', error);
    }
  }, [localMicrophoneTrack]);

  useEffect(() => {
    if (localMicrophoneTrack) {
      fetchMicrophones();
    }
  }, [fetchMicrophones, localMicrophoneTrack]);

  const handleDeviceChange = async (deviceId: string) => {
    if (!localMicrophoneTrack) return;

    try {
      await localMicrophoneTrack.setDevice(deviceId);
      setCurrentDeviceId(deviceId);
      // console.log('Microphone device changed to:', deviceId);
    } catch (error) {
      console.error('Error changing microphone device:', error);
    }
  };

  useEffect(() => {
    const setupDeviceChangeListener = async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-react')).default;

        AgoraRTC.onMicrophoneChanged = async (changedDevice) => {
          await fetchMicrophones();

          if (changedDevice.state === 'ACTIVE' && localMicrophoneTrack) {
            await localMicrophoneTrack.setDevice(changedDevice.device.deviceId);
            setCurrentDeviceId(changedDevice.device.deviceId);
          } else if (
            changedDevice.device.label ===
              localMicrophoneTrack?.getTrackLabel() &&
            changedDevice.state === 'INACTIVE'
          ) {
            const microphones = await AgoraRTC.getMicrophones();
            if (microphones[0] && localMicrophoneTrack) {
              await localMicrophoneTrack.setDevice(microphones[0].deviceId);
              setCurrentDeviceId(microphones[0].deviceId);
            }
          }
        };
      } catch (error) {
        console.error('Error setting up device change listener:', error);
      }
    };

    setupDeviceChangeListener();

    return () => {
      import('agora-rtc-react').then(({ default: AgoraRTC }) => {
        AgoraRTC.onMicrophoneChanged = undefined;
      });
    };
  }, [fetchMicrophones, localMicrophoneTrack]);

  if (devices.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      {/* Trigger button for the device list anchored in the in-call control dock. */}
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-10 h-10 bg-secondary hover:bg-accent/10 border border-border"
          title="Select microphone"
        >
          <Settings className="h-4 w-4 text-foreground" />
        </Button>
      </DropdownMenuTrigger>
      {/* Device menu: current selection plus all discovered microphones. */}
      <DropdownMenuContent
        align="center"
        className="w-56 bg-popover border-border"
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Microphone
        </div>
        {devices.map((device) => (
          <DropdownMenuItem
            key={device.deviceId}
            onClick={() => handleDeviceChange(device.deviceId)}
            className={`cursor-pointer ${
              device.deviceId === currentDeviceId
                ? 'bg-accent/15 text-primary'
                : 'text-foreground hover:bg-accent/10'
            }`}
          >
            <span className="truncate">{device.label}</span>
            {device.deviceId === currentDeviceId && (
              <Check className="ml-auto h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
