'use client';
import dynamic from 'next/dynamic';
import type { CommissionFolderGroup } from '@/app/수수료율/page';

const CommissionRateClient = dynamic(
  () => import('@/components/CommissionRateClient'),
  { ssr: false },
);

export default function CommissionRateWrapper({
  folderGroups,
}: {
  folderGroups: CommissionFolderGroup[];
}) {
  return <CommissionRateClient folderGroups={folderGroups} />;
}
