'use client';
import dynamic from 'next/dynamic';
import type { CommissionFolderGroup } from '@/app/commission-rate/types';

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
