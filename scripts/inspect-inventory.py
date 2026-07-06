import pandas as pd
import json

path = r"C:\Users\user\OneDrive - 아주헬스케어그룹\아주약품\월별재고.xlsx"
xl = pd.read_excel(path, sheet_name=None, header=None, nrows=15)
for name, df in xl.items():
    print(f"\n=== Sheet: {name} ===")
    print(df.to_string())
