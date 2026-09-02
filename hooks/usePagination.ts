"use client";

import { useState, useMemo } from "react";

const STORAGE_KEY = "gym_page_size";

export function usePagination(initialPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [totalItems, setTotalItems] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalItems / pageSize)), [totalItems, pageSize]);

  const from = useMemo(() => (page - 1) * pageSize, [page, pageSize]);
  const to = useMemo(() => from + pageSize - 1, [from, pageSize]);

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(size));
    }
  };

  const resetPage = () => setPage(1);

  return { page, pageSize, totalItems, totalPages, from, to, setPage, setPageSize, setTotalItems, resetPage };
}
