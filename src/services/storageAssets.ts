import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { AssetType } from "../types/domain";
import { getFirebaseStorage } from "./firebase";

function assetTypeFromFile(file: File): AssetType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  return "imagen";
}

export async function uploadCommercialAsset(file: File) {
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage no esta configurado.");

  const cleanName = file.name.replace(/[^\w.-]+/g, "-").toLowerCase();
  const storagePath = `assets/${crypto.randomUUID()}-${cleanName}`;
  const assetRef = ref(storage, storagePath);
  await uploadBytes(assetRef, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(assetRef);

  return {
    name: file.name.replace(/\.[^.]+$/, ""),
    type: assetTypeFromFile(file),
    url,
    storagePath
  };
}
