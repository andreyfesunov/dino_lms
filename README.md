<p align="center">
  <img src="assets/dino-mark.svg" width="96" height="96" alt="Dino LMS" />
</p>

<h1 align="center">Dino LMS</h1>

<p align="center">Learning management system — cards, lessons, and groups.</p>

## First launch

1. Apply database migrations:

   ```sh
   cargo run -p initializer -- migrate
   ```

2. Start the web app:

   ```sh
   cargo run -p web
   ```

3. Open the served page — the system detects there is no administrator and
   offers to create one (`/setup`). The first administrator signs in immediately
   after creation.

A first admin can also be created from the CLI (without names the account
completes onboarding on first sign-in):

```sh
cargo run -p initializer -- bootstrap-admin --login admin@dino.lms --password <password>
```
