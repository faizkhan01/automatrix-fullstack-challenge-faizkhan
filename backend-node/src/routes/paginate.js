/** Builds the same pagination envelope as Laravel's paginated API resources. */
export function paginated(req, data, { page, perPage, total }) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const base = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path === "/" ? "" : req.path}`;
  // Keep the active filters (status, search, per_page) so following a link can't widen the result set.
  const query = new URL(req.originalUrl, "http://localhost").searchParams;
  const url = (p) => {
    query.set("page", String(p));
    return `${base}?${query}`;
  };
  const isEmpty = data.length === 0;

  return {
    data,
    links: {
      first: url(1),
      last: url(lastPage),
      prev: page > 1 ? url(page - 1) : null,
      next: page < lastPage ? url(page + 1) : null,
    },
    meta: {
      current_page: page,
      last_page: lastPage,
      per_page: perPage,
      total,
      from: isEmpty ? null : (page - 1) * perPage + 1,
      to: isEmpty ? null : (page - 1) * perPage + data.length,
    },
  };
}
