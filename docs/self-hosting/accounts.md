# Accounts and Passwords

Everyone has one account per instance, and archive access is granted separately
through invite links. There are two places to manage accounts, both in the account
menu at the top right.

## Your own account

**Account settings** lets anyone change their name, email and password.

- Changing your email or password asks for your current password.
- Changing your password signs you out everywhere except the device you're on.
- A change of email takes effect straight away and isn't confirmed by a link, so check
  the new address before saving.

## Managing users (Owner only)

**Manage users** lists every account and the archives it belongs to. Roles are set in
each archive's settings. From here the Owner can create a password reset link or remove
an account. Both are recorded in the audit log of each archive the person belongs to.

### Removing an account

Removal ends the person's sign-in immediately and can't be undone. It keeps what they
added to the family's archives.

| Item                                                 | After removal                                         |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Sign-in, memberships, preferences                    | Deleted                                               |
| People, media, collections, tags, imports            | Stay; media shows "by unknown"                        |
| Suggestions                                          | Stay, shown as from "A former member"                 |
| Audit entries                                        | Stay, shown as "Name (removed)"                       |
| Invite links they created, or that were sent to them | Revoked                                               |
| Pending password reset link                          | Cancelled                                             |
| Their email address                                  | Free to use again, as a new account with a new invite |

Invite links can be used by anyone holding them, so a link someone else handed the
person keeps working until it expires. Revoke it in that archive's settings if you need
to keep them out.

If the person is an archive's only admin, the confirmation names it. You can still
manage that archive as Owner, and can make someone else its admin.

The Owner's own account can't be removed.

## Forgotten passwords

**With SMTP configured**, "Forgot your password?" on the sign-in page emails a reset link.

**Without SMTP**, the Owner creates the link: **Manage users → Create reset link**, then
send it to the person privately. A link works once and expires after an hour, and using
it signs that person out everywhere. Anyone who has the link can set a new password for
that account.

Links use `APP_URL` as their address, so make sure that's set to the address people
reach this server on (see the [environment reference](environment.md)).

## Recovering the Owner account

The reset link needs a signed-in Owner, and the Owner can't create one for themselves.
If you're the Owner and have lost your password on an instance without SMTP, insert a
reset token directly. From your install directory:

```bash
TOKEN=$(openssl rand -hex 32)
docker compose exec -T postgres psql -U familyarchive -d familyarchive -c "
  INSERT INTO verification_tokens (identifier, token, expires)
  SELECT 'pwreset:' || email, encode(sha256('$TOKEN'::bytea), 'hex'), now() + interval '1 hour'
  FROM users WHERE role = 'owner';"
echo "Open this link to set a new password: http://localhost:3000/reset-password?token=$TOKEN"
```

The command should print `INSERT 0 1`. Replace `http://localhost:3000` with your
`APP_URL`, and `familyarchive` with your `POSTGRES_USER` and `POSTGRES_DB` if you
changed them. The token is valid for one hour.
