# Simulated radio voice

`public/audio/vhf-juniper-33a89e30.mp3` was synthesized offline using Piper 1.8.0 and the `en_GB-cori-medium` voice. The voice's [model card](https://huggingface.co/rhasspy/piper-voices/blob/3001aba6a7e29fca16fd6174d4fac367951b7929/en/en_GB/cori/medium/MODEL_CARD) identifies public-domain LibriVox recordings and training from scratch. The model repository is MIT-licensed; Piper is GPL-3.0-or-later and was used as an offline authoring tool, not included in the game.

Model LFS SHA-256: `1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d`. Model configuration Git blob: `dba82adcb901f9cb8084dedd976a51ea5524f89a`. The output was filtered with FFmpeg using `highpass=f=350,lowpass=f=3000,acompressor=threshold=0.1:ratio=4`, then encoded as a 96 kbps MP3. Output SHA-256: `33a89e30abd85a342ad8210e80e455ecb715f026e3317fc590049b5838802120`.

The message is a fictional simulation of a Channel 16 safety announcement for the active buoy course, not a real transmission. Spoken pronunciation and intelligibility, radio procedure, playback timing, and the experience on desktop and mobile still require listening, browser and qualified-instructor review.
