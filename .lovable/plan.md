## Polish voice input mic release

Update `src/hooks/useVoiceInput.tsx` to release the temporary microphone stream immediately after the permission probe, so Android doesn't show two mic indicators when voice search starts.

### Change
In the `start()` callback, replace the current permission probe:

```ts
await (navigator as any).mediaDevices.getUserMedia({ audio: true });
```

with:

```ts
const probeStream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
probeStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
```

Everything else (error handling, the `SpeechRecognition` setup, the deny toast) stays exactly as in the version you pasted.

### File touched
- `src/hooks/useVoiceInput.tsx`

No native Android changes needed for this tweak — you still apply the `RECORD_AUDIO` permission and `MainActivity.java` override locally as planned.