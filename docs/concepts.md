# Concepts: Archives, Sources, and Branches

## Archive — the shared graph

An **archive** is FamilyArchive's container: people, relationships, media,
members, and roles all belong to one archive, and archives are fully isolated
from each other. One instance can host several (e.g. two unrelated families).

Within an archive there is **one shared family graph**. Everyone you invite
works on the same people: shared ancestors exist once, and their photos,
documents, and stories are shared by all contributors. The interactive _tree_
is the primary view of an archive — the archive is the data, the tree is how
you browse it.

## Sources — where imports came from

Every GEDCOM import is recorded as a **source**: who imported which file, when,
and what it contained. Imported people and relationships keep a reference to
their source, and the original GEDCOM records are preserved verbatim in
metadata. Sources are provenance, not separate trees — the imported people
join the archive's shared graph.

## Duplicates and merging

When relatives import overlapping research, the same ancestor can arrive twice.
FamilyArchive flags likely duplicates (same name, compatible birth years) and
offers a side-by-side **Compare & merge**: you choose which values to keep per
field; relationships, media tags, face tags, and alternate names are
consolidated automatically; both records' provenance is preserved. Merging is
always explicit and human-driven.

## Branches — decluttered browsing

Big collaborative archives contain people you're not related to (your cousin's
in-laws, for example). Your **starting person** anchors your view of the
archive: the default "**My branch**" scope on People and Media shows your blood
relatives — your anchor's ancestors, all their descendants, and the partners of
those people — without ever wandering into an in-law's unrelated branch.

Switch to "Everyone" any time. Branch views are a browsing convenience only:
**every member of an archive can always see the entire archive.** If you need
real separation, use separate archives.

## Public archives

Archives are private by default. An admin can flip an archive to **public
read-only mode**: the entire archive — tree, people, and all media — becomes
viewable by anyone with the link, with no account. Public visitors cannot
edit, upload, tag, or suggest. Search-engine indexing is a separate opt-in;
without it the pages carry a `noindex` tag.

## Suggestions and the audit log

Members who can't edit directly (viewers and contributors) can **suggest
corrections** on people, media, or the archive itself; admins get an email (if
SMTP is configured) and review suggestions in one queue. Separately, an
admin-only **audit log** records destructive and modifying actions — person
and media changes, merges, membership and invite changes, and public-mode
toggles — with configurable retention.
