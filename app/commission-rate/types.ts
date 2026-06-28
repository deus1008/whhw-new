export type CommissionDoc = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
};

export type CommissionFolderGroup = {
  key: string;
  folderName: string;
  label: string;
  description: string;
  docs: CommissionDoc[];
};
