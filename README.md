# digital-greenscreen
Just some sample prototype green screen code using Tensorflow lite. Unlite other packages out there, this is extremely simplified for easy access and relatively clear understanding of what's going on.

### Requirements

This requires WASM + SIMD supported (enabled?) on your browser; also it requires Chromium >= v87. (chrome or edge , etc)

To enable WASM + SIMD, go to `chrome://flags` and enable `WebAssembly SIMD support.`

![image](https://user-images.githubusercontent.com/2575698/112218380-02cce780-8bfa-11eb-8a1b-6ceb0bcacfcc.png)

It is also hard-coded to 720p, so your camera needs to support that.

### TRY NOW!

Try it out live: https://steveseguin.github.io/digital-greenscreen/

![image](https://user-images.githubusercontent.com/2575698/112217687-34917e80-8bf9-11eb-9c5a-ff22297f6bd5.png)


### Licencing

This project was initially based on the works of Google and this repo: https://github.com/Volcomix/virtual-background ; Apache-2.0 License.
The Google portion was published initially with an Apache lic, although it changed too a Google Lic at a later date.


