# Reset Notes (MongoDB)

If you “clear all entries” by deleting documents, MongoDB **keeps indexes**. Old/incorrect unique indexes can still cause `E11000 duplicate key` errors.

For a truly clean reset, prefer **dropping collections** (or dropping the bad indexes).

## Common cleanup commands

In `mongosh`:

```js
use abubucargo

// Drop collections (removes documents + indexes)
db.users.drop()
db.profiles.drop()
db.branches.drop()

// Or: remove specific bad indexes if you want to keep the collection
db.branches.getIndexes()
// db.branches.dropIndex('<indexName>')
```

