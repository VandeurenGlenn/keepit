# keepit

## Session Tickets

De app tickets voor websocket en handshake worden nu ondertekend met een persistente server secret.
Daardoor blijven bestaande tickets geldig na een korte server restart tot hun normale vervaltijd van 24 uur.

Je kan de secret expliciet zetten in server.config.json:

```json
{
  "session": {
    "secret": "replace-with-a-long-random-session-secret"
  }
}
```

Als er geen session.secret is opgegeven, maakt keepit automatisch een persistente secret aan in `.database/session-secret`.

