The mudsh_ai application is licensed under MIT.

The browser interpreter is just-bash 3.6.0, Copyright Vercel Inc.,
Apache License 2.0. The published demo includes its license at
licenses/just-bash.txt and retains bundled notices in the JavaScript.

scripts/build.mjs adapts the cwd patch from gipapa/agent-go-round
(MIT, Copyright (c) 2026). Permission and warranty terms are in LICENSE.
Our build verifies the original browser artifact and modifies its public
execution result to include the final working directory, including early
exit paths. Command case stays unchanged. Unsupported browser gzip
operations report an error.
