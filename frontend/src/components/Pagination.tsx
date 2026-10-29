interface PaginationProps {
  page: number;
  lastPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, lastPage, onPageChange }: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span>
        Page {page} of {lastPage}
      </span>
      <button className="secondary" onClick={() => onPageChange(page + 1)} disabled={page >= lastPage}>
        Next
      </button>
    </nav>
  );
}
