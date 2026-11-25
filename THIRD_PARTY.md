The mudsh_ai application is licensed under MIT.

The Lantern Below's puzzle concepts draw on Jose E. Rodriguez Rios's
[CTF Challenges](https://github.com/joserico00/ctf-challenges) (MIT).
The dungeon text, generated fixtures, and validators are written for mudsh_ai.

The browser interpreter is just-bash 3.6.0, Copyright Vercel Inc.,
Apache License 2.0. The published demo includes its license at
licenses/just-bash.txt and retains bundled notices in the JavaScript.

Advanced sprite mode uses the Pi Agent Core, Pi AI and Pi Telemetry 0.84.4
packages under the MIT License. Their license is at licenses/pi.txt.
The published demo includes license texts for OpenAI's SDK, TypeBox,
ignore, partial-json and YAML under licenses/.

scripts/build.mjs adapts the cwd patch from gipapa/agent-go-round
(MIT, Copyright (c) 2026). Permission and warranty terms are in LICENSE.
Our build verifies the original browser artifact and modifies its public
execution result to include the final working directory, including early
exit paths. A second edit aligns recursive grep with GNU grep's handling of
dotfiles.

fflate 0.8.2 is used for gzip archive fixtures and browser decompression
under the MIT License. The web build includes its license at
licenses/fflate.txt. The local Docker image includes it at
/opt/mudsh/fflate-LICENSE.
