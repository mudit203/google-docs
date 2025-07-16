"use client";

import Image from "next/image";
import Link from "next/link";
import {toast} from "sonner";
import { Editor } from "@tiptap/react";

// icons
import { BsFilePdf } from "react-icons/bs";
import {
  BoldIcon,
  FileIcon,
  FileJsonIcon,
  FilePenIcon,
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  ItalicIcon,
  PrinterIcon,
  Redo2Icon,
  RemoveFormattingIcon,
  StrikethroughIcon,
  TextIcon,
  // TrashIcon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react";

import { RenameDialog } from "@/components/rename-dialog";
// import { RemoveDialog } from "@/components/remove-dialog";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";

import { Avatars } from "./avatars";

import { DocumentInput } from "./document-input";
import { useEditorStore } from "@/store/use-editor-store";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Inbox } from "./inbox";
import { Doc } from "../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";


interface WordDocumentUploadOptions {
  editor: Editor; // Explicitly type the editor
}

interface NavbarProps {
  data: Doc<"documents">;
}

export const Navbar = ({ data }: NavbarProps) => {
  const router = useRouter();
  const { editor } = useEditorStore();

  const mutation = useMutation(api.documents.create);
  const onNewDocument = () => {
    mutation({
      title: "Untitled Document",
      initialContent: "",
    })
      .catch(() => toast.error("Something went wrong"))
      .then((id) => {
        toast.success("Document created");
        router.push(`/documents/${id}`);
      });
  };

  const insertTable = ({ rows, cols }: { rows: number; cols: number }) => {
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
  };

const handleWordDocumentUpload = async (editor: any) => {
  // Create a hidden file input
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".docx";
  
  // Handle file selection
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.docx')) {
      toast.error("Please select a .docx file");
      return;
    }
    
    try {
      // Show loading toast
      toast.loading("Processing Word document...");
      
      // Import required libraries
      const [{ renderAsync }, JSZip] = await Promise.all([
        import("docx-preview"),
        import("jszip")
      ]);
      
      console.log("� Processing file:", file.name, "Size:", file.size);
      
      // Create a temporary container for rendering
      const tempContainer = document.createElement("div");
      tempContainer.style.position = "absolute";
      tempContainer.style.left = "-9999px";
      tempContainer.style.top = "-9999px";
      tempContainer.style.width = "800px";
      document.body.appendChild(tempContainer);
      
      // Configure docx-preview options
      const options = {
        className: "docx-preview-container",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: false,
        ignoreLastRenderedPageBreak: true,
        experimental: true,
        trimXmlDeclaration: true,
        useBase64URL: true,
        useMathMLPolyfill: true,
        showChanges: false,
        debug: false
      };
      
      console.log("🔄 Rendering document with docx-preview...");
      
      // Render the document
      await renderAsync(file, tempContainer, undefined, options);
      
      console.log("✅ Document rendered successfully");
      
      // Get the rendered HTML
      let renderedHtml = tempContainer.innerHTML;
      
      console.log("📝 Rendered HTML length:", renderedHtml.length);
      console.log("🔍 Raw rendered HTML preview:", renderedHtml.substring(0, 500) + "...");
      
      // Process and clean up the HTML
      renderedHtml = await processDocxHtml(renderedHtml, file);
      
      // Clean up temporary container
      document.body.removeChild(tempContainer);
      
      if (editor) {
        console.log("🔄 Setting content in editor...");
        
        // Clear current content
        editor.commands.clearContent();
        
        // Test if images are valid by checking a sample
        const testImageMatch = renderedHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/);
        if (testImageMatch) {
          let testSrc = testImageMatch[1];
          
          // Fix MIME type for testing if needed
          if (testSrc.startsWith('data:application/octet-stream;base64,')) {
            const base64Data = testSrc.replace('data:application/octet-stream;base64,', '');
            let detectedType = 'image/jpeg'; // default
            
            if (base64Data.startsWith('/9j/')) {
              detectedType = 'image/jpeg';
            } else if (base64Data.startsWith('iVBORw0KGgo')) {
              detectedType = 'image/png';
            }
            
            testSrc = `data:${detectedType};base64,${base64Data}`;
          }
          
          console.log("🧪 Testing image validity:", testSrc.substring(0, 100) + "...");
          
          // Create a test image to verify it loads
          const testImg = document.createElement('img');
          testImg.onload = () => {
            console.log("✅ Test image loaded successfully");
          };
          testImg.onerror = () => {
            console.log("❌ Test image failed to load");
          };
          testImg.src = testSrc;
        }
        
        // Set the processed HTML content
        editor.commands.setContent(renderedHtml);
        
        // Force a re-render to ensure images are processed
        editor.commands.focus();
        
        // Single comprehensive verification after sufficient time
        setTimeout(() => {
          const editorContent = editor.getHTML();
          const domImages = editor.view.dom.querySelectorAll('img');
          const domTables = editor.view.dom.querySelectorAll('table');
          const expectedImages = (renderedHtml.match(/<img/g) || []).length;
          
          console.log("� Final content verification:", {
            expectedImages: expectedImages,
            domImages: domImages.length,
            tables: domTables.length,
            contentLength: editorContent.length
          });
          
          // Check if we have significantly fewer images than expected
          if (domImages.length < expectedImages && expectedImages > 0) {
            console.log(`⚠️ Missing images: Expected ${expectedImages}, found ${domImages.length}`);
            
            // Try the alternative approach only if we're missing most images
            if (domImages.length < expectedImages * 0.3) {
              console.log("🔄 Trying alternative image insertion method...");
              
              // Find all image tags in the processed HTML
              const imageMatches = renderedHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/g);
              if (imageMatches) {
                console.log("🖼️ Found", imageMatches.length, "images to insert");
                
                // Insert missing images at appropriate positions
                imageMatches.forEach((imgTag: string, index: number) => {
                  // Skip if this image is already in the DOM
                  if (index < domImages.length) {
                    return;
                  }
                  
                  const srcMatch = imgTag.match(/src="([^"]+)"/);
                  if (srcMatch && srcMatch[1]) {
                    let finalSrc = srcMatch[1];
                    
                    // Fix MIME type if needed
                    if (finalSrc.startsWith('data:application/octet-stream;base64,')) {
                      const base64Data = finalSrc.replace('data:application/octet-stream;base64,', '');
                      
                      let detectedType = 'image/jpeg';
                      if (base64Data.startsWith('/9j/')) {
                        detectedType = 'image/jpeg';
                      } else if (base64Data.startsWith('iVBORw0KGgo')) {
                        detectedType = 'image/png';
                      } else if (base64Data.startsWith('R0lGODlh')) {
                        detectedType = 'image/gif';
                      } else if (base64Data.startsWith('UklGR')) {
                        detectedType = 'image/webp';
                      }
                      
                      finalSrc = `data:${detectedType};base64,${base64Data}`;
                    }
                    
                    console.log(`📸 Inserting missing image ${index + 1}...`);
                    
                    // Insert the image
                    editor.commands.focus('end');
                    editor.commands.insertContent('<p></p>');
                    editor.commands.setImage({ 
                      src: finalSrc, 
                      alt: `Imported image ${index + 1}` 
                    });
                  }
                });
              }
            }
          }
          
          // Log final DOM state
          if (domImages.length > 0) {
            console.log("🖼️ Final images in DOM:", domImages.length);
            domImages.forEach((img: HTMLImageElement, index: number) => {
              console.log(`📸 Image ${index + 1}:`, {
                src: img.src.substring(0, 50) + "...",
                alt: img.alt,
                complete: img.complete,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight
              });
            });
          } else {
            console.log("❌ No images found in final DOM");
          }
        }, 1000);
        
        // Success message
        toast.dismiss();
        toast.success("Document imported successfully!");
      }
    } catch (error: unknown) {
      console.error("❌ Error during document upload:", error);
      toast.dismiss();
      toast.error(`Failed to import document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  // Trigger file selection
  input.click();
};

// Helper function to process and clean up the docx-preview HTML
const processDocxHtml = async (html: string, file: File): Promise<string> => {
  console.log("🔧 Processing HTML for TipTap compatibility...");
  
  let processedHtml = html;
  
  // Remove docx-preview specific wrapper classes but keep content
  processedHtml = processedHtml.replace(/<div class="docx-preview-container"[^>]*>/gi, '<div class="word-document-import">');
  
  // Fix image sources - docx-preview uses base64 data URLs which should work
  const imageCount = (processedHtml.match(/<img/g) || []).length;
  console.log("📸 Found", imageCount, "images to process");
  
  // Process images to ensure they work with TipTap
  processedHtml = processedHtml.replace(/<img([^>]*?)>/gi, (match, attributes) => {
    console.log("🖼️ Processing image:", match.substring(0, 100) + "...");
    
    // Extract src and other attributes
    const srcMatch = attributes.match(/src="([^"]+)"/);
    const altMatch = attributes.match(/alt="([^"]*)"/);
    const styleMatch = attributes.match(/style="([^"]*)"/);
    
    if (srcMatch && srcMatch[1]) {
      const src = srcMatch[1];
      const alt = altMatch ? altMatch[1] : "Imported image";
      const existingStyle = styleMatch ? styleMatch[1] : "";
      
      console.log("🖼️ Image src length:", src.length);
      console.log("🖼️ Image src starts with:", src.substring(0, 50));
      
      // Check if it's a base64 data URL (including octet-stream which docx-preview uses)
      if (src.startsWith('data:') && src.includes('base64,')) {
        let finalSrc = src;
        
        // Fix MIME type if it's octet-stream but contains image data
        if (src.startsWith('data:application/octet-stream;base64,')) {
          const base64Data = src.replace('data:application/octet-stream;base64,', '');
          
          // Try to detect image type from base64 data
          let detectedType = 'image/jpeg'; // default
          
          // Check for common image signatures in base64
          if (base64Data.startsWith('/9j/')) {
            detectedType = 'image/jpeg';
          } else if (base64Data.startsWith('iVBORw0KGgo')) {
            detectedType = 'image/png';
          } else if (base64Data.startsWith('R0lGODlh')) {
            detectedType = 'image/gif';
          } else if (base64Data.startsWith('UklGR')) {
            detectedType = 'image/webp';
          }
          
          finalSrc = `data:${detectedType};base64,${base64Data}`;
          console.log("🔧 Fixed MIME type:", detectedType);
        }
        
        console.log("✅ Valid data URL found (final):", finalSrc.substring(0, 50));
        
        // Create a clean, TipTap-compatible image tag
        return `<img src="${finalSrc}" alt="${alt}" class="imported-image docx-image" style="max-width: 100%; height: auto; display: block; margin: 1rem 0;" />`;
      } else {
        console.log("❌ Invalid image src:", src.substring(0, 100));
        return ''; // Remove invalid images
      }
    }
    
    console.log("❌ No valid src found in image tag");
    return ''; // Remove malformed image tags
  });
  
  // Enhanced table processing
  processedHtml = processedHtml.replace(/<table([^>]*?)>/gi, (match, attributes) => {
    console.log("📋 Processing table:", match.substring(0, 100) + "...");
    
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `border-collapse: collapse; width: 100%; margin: 1rem 0; border: 1px solid #ddd; font-size: 14px; ${existingStyle}`;
    
    return `<table class="word-table docx-table" style="${enhancedStyle}">`;
  });
  
  // Enhanced table cell processing
  processedHtml = processedHtml.replace(/<td([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `border: 1px solid #ddd; padding: 8px; vertical-align: top; ${existingStyle}`;
    
    return `<td style="${enhancedStyle}">`;
  });
  
  processedHtml = processedHtml.replace(/<th([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f8f9fa; text-align: left; ${existingStyle}`;
    
    return `<th style="${enhancedStyle}">`;
  });
  
  // Enhanced heading processing
  for (let i = 1; i <= 6; i++) {
    const headingRegex = new RegExp(`<h${i}([^>]*?)>`, 'gi');
    processedHtml = processedHtml.replace(headingRegex, (match, attributes) => {
      const styleMatch = attributes.match(/style="([^"]*)"/);
      const existingStyle = styleMatch ? styleMatch[1] : "";
      
      const fontSize = i === 1 ? '2em' : i === 2 ? '1.5em' : i === 3 ? '1.17em' : '1em';
      const margin = i <= 3 ? '1.5em 0 0.5em 0' : '1em 0 0.5em 0';
      
      const enhancedStyle = `font-size: ${fontSize}; font-weight: bold; margin: ${margin}; color: #2d3748; ${existingStyle}`;
      
      return `<h${i} style="${enhancedStyle}">`;
    });
  }
  
  // Enhanced paragraph processing
  processedHtml = processedHtml.replace(/<p([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    let enhancedStyle = `margin-bottom: 1em; line-height: 1.6; ${existingStyle}`;
    
    // Check for text alignment in existing styles
    if (existingStyle.includes('text-align: center')) {
      enhancedStyle = `text-align: center; margin-bottom: 1em; line-height: 1.6; ${existingStyle}`;
    } else if (existingStyle.includes('text-align: right')) {
      enhancedStyle = `text-align: right; margin-bottom: 1em; line-height: 1.6; ${existingStyle}`;
    }
    
    return `<p style="${enhancedStyle}">`;
  });
  
  // Enhanced list processing
  processedHtml = processedHtml.replace(/<ul([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `margin: 1em 0; padding-left: 2em; list-style-type: disc; ${existingStyle}`;
    
    return `<ul style="${enhancedStyle}">`;
  });
  
  processedHtml = processedHtml.replace(/<ol([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `margin: 1em 0; padding-left: 2em; list-style-type: decimal; ${existingStyle}`;
    
    return `<ol style="${enhancedStyle}">`;
  });
  
  processedHtml = processedHtml.replace(/<li([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `margin-bottom: 0.5em; line-height: 1.5; ${existingStyle}`;
    
    return `<li style="${enhancedStyle}">`;
  });
  
  // Enhanced text formatting
  processedHtml = processedHtml.replace(/<strong([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `font-weight: bold; ${existingStyle}`;
    
    return `<strong style="${enhancedStyle}">`;
  });
  
  processedHtml = processedHtml.replace(/<em([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `font-style: italic; ${existingStyle}`;
    
    return `<em style="${enhancedStyle}">`;
  });
  
  processedHtml = processedHtml.replace(/<u([^>]*?)>/gi, (match, attributes) => {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    const existingStyle = styleMatch ? styleMatch[1] : "";
    
    const enhancedStyle = `text-decoration: underline; ${existingStyle}`;
    
    return `<u style="${enhancedStyle}">`;
  });
  
  // Clean up any remaining docx-preview specific elements
  processedHtml = processedHtml.replace(/class="[^"]*docx-preview[^"]*"/gi, '');
  
  // Add comprehensive wrapper styling
  const wrapperStyle = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
    line-height: 1.6; 
    color: #2d3748; 
    max-width: 100%; 
    overflow-wrap: break-word;
  `;
  
  processedHtml = `<div class="word-document-import docx-import" style="${wrapperStyle}">${processedHtml}</div>`;
  
  // Final counts
  const finalImageCount = (processedHtml.match(/<img/g) || []).length;
  const finalTableCount = (processedHtml.match(/<table/g) || []).length;
  
  console.log("✅ HTML processing complete:", {
    images: finalImageCount,
    tables: finalTableCount,
    htmlLength: processedHtml.length
  });
  
  return processedHtml;
};


  const onDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const onSaveJson = () => {
    if (!editor) return;

    const content = editor.getJSON();
    const blob = new Blob([JSON.stringify(content)], {
      type: "application/json",
    });
    onDownload(blob, `${data.title}.json`);
  };

  const onSaveHTML = () => {
    if (!editor) return;

    const content = editor.getHTML();
    const blob = new Blob([content], {
      type: "text/html",
    });
    onDownload(blob, `${data.title}.html`);
  };

  const onSaveText = () => {
    if (!editor) return;

    const content = editor.getText();
    const blob = new Blob([content], {
      type: "text/plain",
    });
    onDownload(blob, `${data.title}.txt`);
  };

  return (
    <nav className="flex items-center justify-between">
      <div className="flex gap-2 items-center">
        <Link href="/">
          <Image src={"/logo.svg"} alt="logo" width={36} height={36} />
        </Link>
        <div className="flex flex-col">
          <DocumentInput title={data.title} id={data._id} />
          <div className="flex">
            <Menubar className="border-none bg-transparent shadow-none h-auto p-0">
              <MenubarMenu>
                <MenubarTrigger className="text-sm font-normal py-0.5 px-[7px] rounded-sm hover:bg-muted h-auto">
                  File
                </MenubarTrigger>
                <MenubarContent className="print:hidden">
                  <MenubarSub>
                    <MenubarSubTrigger>
                      <FileIcon className="size-4 mr-2" /> Save
                    </MenubarSubTrigger>
                    <MenubarSubContent>
                      <MenubarItem onClick={onSaveJson}>
                        <FileJsonIcon className="size-4 mr-2" />
                        JSON
                      </MenubarItem>
                      <MenubarItem onClick={onSaveHTML}>
                        <GlobeIcon className="size-4 mr-2" />
                        HTML
                      </MenubarItem>
                      <MenubarItem onClick={() => window.print()}>
                        <BsFilePdf className="size-4 mr-2" />
                        PDF
                      </MenubarItem>
                      <MenubarItem onClick={onSaveText}>
                        <FileTextIcon className="size-4 mr-2" />
                        Text
                      </MenubarItem>
                    </MenubarSubContent>
                  </MenubarSub>
                  <MenubarItem onClick={onNewDocument}>
                    <FilePlusIcon className="mr-2 size-4" />
                    New Document
                  </MenubarItem>
                  <MenubarSeparator />
                  <RenameDialog documentId={data._id} initialTitle={data.title}>
                    <MenubarItem
                      onClick={(e) => e.stopPropagation()}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <FilePenIcon className="mr-2 size-4" />
                      Rename
                    </MenubarItem>
                  </RenameDialog>
                  {/* <RemoveDialog documentId={data._id}>
                    <MenubarItem
                      onClick={(e) => e.stopPropagation()}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <TrashIcon className="mr-2 size-4" />
                      Remove
                    </MenubarItem>
                  </RemoveDialog> */}
                  <MenubarSeparator />
                  <MenubarItem onClick={() => window.print()}>
                    <PrinterIcon className="mr-2 size-4" />
                    Print <MenubarShortcut>&#x2318; + P</MenubarShortcut>
                  </MenubarItem>
               <MenubarItem onClick={(e) => {
  e.preventDefault();
  handleWordDocumentUpload(editor);
}}>
  <FileIcon className="mr-2 size-4" />
  Open Word Document <MenubarShortcut>&#x2318; + O</MenubarShortcut>
</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger className="text-sm font-normal py-0.5 px-[7px] rounded-sm hover:bg-muted h-auto">
                  Edit
                </MenubarTrigger>
                <MenubarContent>
                  <MenubarItem onClick={() => editor?.chain().focus().undo().run()}>
                    <Undo2Icon className="mr-2 size-4" />
                    Undo <MenubarShortcut>&#x2318; + Z</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem onClick={() => editor?.chain().focus().redo().run()}>
                    <Redo2Icon className="mr-2 size-4" />
                    Redo <MenubarShortcut>&#x2318; + Y</MenubarShortcut>
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger className="text-sm font-normal py-0.5 px-[7px] rounded-sm hover:bg-muted h-auto">
                  Insert
                </MenubarTrigger>
                <MenubarContent>
                  <MenubarSub>
                    <MenubarSubTrigger>Table</MenubarSubTrigger>
                    <MenubarSubContent>
                      <MenubarItem onClick={() => insertTable({ rows: 1, cols: 1 })}>
                        1 x 1
                      </MenubarItem>
                      <MenubarItem onClick={() => insertTable({ rows: 2, cols: 2 })}>
                        2 x 2
                      </MenubarItem>
                      <MenubarItem onClick={() => insertTable({ rows: 4, cols: 4 })}>
                        4 x 4
                      </MenubarItem>
                      <MenubarItem onClick={() => insertTable({ rows: 4, cols: 6 })}>
                        4 x 6
                      </MenubarItem>
                    </MenubarSubContent>
                  </MenubarSub>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger className="text-sm font-normal py-0.5 px-[7px] rounded-sm hover:bg-muted h-auto">
                  Format
                </MenubarTrigger>
                <MenubarContent>
                  <MenubarSub>
                    <MenubarSubTrigger>
                      <TextIcon className="size-4 mr-2" />
                      Text
                    </MenubarSubTrigger>
                    <MenubarSubContent>
                      <MenubarItem onClick={() => editor?.chain().focus().toggleBold().run()}>
                        <BoldIcon className="size-4 mr-2" />
                        Bold
                      </MenubarItem>
                      <MenubarItem onClick={() => editor?.chain().focus().toggleItalic().run()}>
                        <ItalicIcon className="size-4 mr-2" />
                        Italic
                      </MenubarItem>
                      <MenubarItem onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                        <UnderlineIcon className="size-4 mr-2" />
                        Underline
                      </MenubarItem>
                      <MenubarItem onClick={() => editor?.chain().focus().toggleStrike().run()}>
                        <StrikethroughIcon className="size-4 mr-2" />
                        Strikethrough
                      </MenubarItem>
                    </MenubarSubContent>
                  </MenubarSub>
                  <MenubarItem onClick={() => editor?.chain().focus().unsetAllMarks().run()}>
                    <RemoveFormattingIcon className="size-4 mr-2" />
                    Clear formatting
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </div>
        </div>
      </div>
      <div className="flex gap-3 items-center pl-6">
        <Avatars />
        <Inbox />
        <OrganizationSwitcher
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterSelectPersonalUrl="/"
        />
        <UserButton />
      </div>
    </nav>
  );
};
