import React, { useCallback } from 'react';
import { Upload, FileJson, Lock } from 'lucide-react';

interface FileUploadProps {
  onFileLoaded: (data: any) => void;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileLoaded, disabled = false }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = event.target.files?.[0];
    processFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    processFile(file);
  };

  const processFile = (file: File | undefined) => {
    if (!file || disabled) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        onFileLoaded(json);
      } catch (error) {
        alert("Invalid JSON file. Please upload a valid Google Timeline JSON.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div 
      className={`relative flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-xl transition-all 
        ${disabled 
          ? 'border-slate-800 bg-slate-900/30 cursor-not-allowed opacity-60' 
          : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800/80 cursor-pointer group'
        }`}
      onDragOver={(e) => !disabled && e.preventDefault()}
      onDrop={handleDrop}
    >
      <label className={`flex flex-col items-center justify-center w-full h-full ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <div className={`p-4 rounded-full mb-4 transition-colors ${disabled ? 'bg-slate-800' : 'bg-indigo-500/10 group-hover:bg-indigo-500/20'}`}>
            {disabled ? (
              <Lock className="w-10 h-10 text-slate-600" />
            ) : (
              <Upload className="w-10 h-10 text-indigo-400" />
            )}
          </div>
          <p className="mb-2 text-xl font-semibold text-slate-200">
            {disabled ? 'Enter API Key to unlock' : 'Click to upload or drag and drop'}
          </p>
          <p className="mb-6 text-sm text-slate-400">
            Select your <code className="bg-slate-900 px-2 py-1 rounded text-indigo-300">Timeline.json</code> file
          </p>
          {!disabled && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-900/50 px-3 py-2 rounded-full border border-slate-700">
              <FileJson className="w-4 h-4" />
              <span>Google Takeout Format supported</span>
            </div>
          )}
        </div>
        <input 
          type="file" 
          className="hidden" 
          accept=".json"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>
    </div>
  );
};

export default FileUpload;