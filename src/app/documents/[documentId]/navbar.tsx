"use client";

import Image from "next/image";
import Link from "next/link";

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
import { toast } from "sonner";

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
  input.accept = ".docx,.doc";
  
  // Handle file selection
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    try {
      // Import mammoth dynamically
      const mammoth = await import("mammoth");
      
      // Show loading toast
      toast.loading("Converting document...");
      
      // Enhanced conversion options with better styling and page break handling
      const options = {
        convertImage: mammoth.images.imgElement((image: any) => {
          return image.read("base64").then((imageBuffer: string) => {
            const imgSrc = `data:${image.contentType};base64,${imageBuffer}`;
            console.log("📸 Image converted:", {
              contentType: image.contentType,
              dataLength: imageBuffer.length,
              srcPreview: imgSrc.substring(0, 50) + "..."
            });
            return {
              src: imgSrc,
              alt: "Imported image from Word document",
              style: "max-width: 100%; height: auto; display: block; margin: 1rem 0",
              width: "auto",
              height: "auto"
            };
          }).catch((error: Error) => {
            console.error("❌ Image conversion error:", error);
            return {
              src: "",
              alt: "Failed to convert image"
            };
          });
        }),
        
        // Style mapping to preserve Word document formatting
        styleMap: [
          // Headings
          "p[style-name='Heading 1'] => h1",
          "p[style-name='Heading 2'] => h2", 
          "p[style-name='Heading 3'] => h3",
          "p[style-name='Heading 4'] => h4",
          "p[style-name='Heading 5'] => h5",
          "p[style-name='Heading 6'] => h6",
          
          // Text formatting
          "r[style-name='Strong'] => strong",
          "r[style-name='Emphasis'] => em",
          
          // Lists
          "p[style-name='List Paragraph'] => li:fresh",
          
          // Tables - preserve table structure
          "table => table.imported-table",
          "tr => tr",
          "td => td",
          
          // Page breaks - convert to horizontal rules for visual separation
          "p[style-name='Page Break'] => hr",
          
          // Default paragraph styling
          "p => p:fresh"
        ],
        
        // Handle page breaks through style mapping instead
        includeDefaultStyleMap: true
      };
      
      const result = await mammoth.convertToHtml(
        { arrayBuffer: await file.arrayBuffer() },
        options
      );
      
      if (editor) {
        // Clear current content
        editor.commands.clearContent();
        
        // Process the HTML to add page breaks and improve formatting
        let processedHtml = result.value;
        
        console.log("📝 Raw HTML from mammoth:", processedHtml.substring(0, 500) + "...");
        
        // Add page break styling
           processedHtml = processedHtml.replace(
          /<img([^>]*)>/gi,
          (match, attrs) => {
            console.log("🖼️ Found image tag:", match);
            return `<img${attrs} class="imported-image" style="max-width: 100%; height: auto; display: block; margin: 1rem auto;">`;
          }
        );
        // Ensure images have proper attributes for TipTap
        processedHtml = processedHtml.replace(
          /<img([^>]*)>/gi,
          (match, attrs) => {
            console.log("🖼️ Found image tag:", match);
            return `<img${attrs} class="imported-image" style="max-width: 100%; height: auto; display: block; margin: 1rem auto;">`;
          }
        );
        
        // Improve table styling
        processedHtml = processedHtml.replace(
          /<table/gi,
          '<table style="border-collapse: collapse; width: 100%; margin: 1rem 0; border: 1px solid #ddd;"'
        );
        
        processedHtml = processedHtml.replace(
          /<td/gi,
          '<td style="border: 1px solid #ddd; padding: 0.5rem;"'
        );
        
        console.log("✅ Processed HTML preview:", processedHtml.substring(0, 500) + "...");
        
        // Set new content from Word document
        console.log("🔄 Setting content in editor...");
        
        try {
          // Extract images from HTML for separate insertion
          const images: Array<{src: string, alt: string}> = [];
          const imageRegex = /<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi;
          let match;
          
          while ((match = imageRegex.exec(processedHtml)) !== null) {
            images.push({
              src: match[1],
              alt: match[2]
            });
          }
          
          console.log("🖼️ Extracted images:", images.length);
          
          // Remove images from HTML temporarily
          const htmlWithoutImages = processedHtml.replace(/<img[^>]*>/gi, '<p>[IMAGE_PLACEHOLDER]</p>');
          
          // Set content without images first
          editor.commands.setContent(htmlWithoutImages);
          console.log("✅ Text content set successfully");
          
          // Insert images one by one
          if (images.length > 0) {
            setTimeout(() => {
              images.forEach((image, index) => {
                console.log(`📸 Inserting image ${index + 1}:`, image.src.substring(0, 50) + "...");
                
                // Find placeholder and replace with image
                const content = editor.getHTML();
                const updatedContent = content.replace('<p>[IMAGE_PLACEHOLDER]</p>', 
                  `<img src="${image.src}" alt="${image.alt}" class="imported-image" style="max-width: 100%; height: auto; display: block; margin: 1rem auto;" />`
                );
                editor.commands.setContent(updatedContent);
              });
              
              // Final check
              setTimeout(() => {
                const editorImages = editor.view.dom.querySelectorAll('img');
                console.log("🖼️ Final images in editor:", editorImages.length);
              }, 500);
              
            }, 500);
          }
          
        } catch (error) {
          console.error("❌ Error setting content:", error);
        }
        
        // Display conversion warnings if any
        if (result.messages && result.messages.length > 0) {
          console.warn("Conversion warnings:", result.messages);
          toast.warning("Document converted with some formatting limitations");
        }
        
        // Success message
        toast.dismiss();
        toast.success("Document opened successfully");
      }
    } catch (error) {
      console.error("Error opening document:", error);
      toast.dismiss();
      toast.error("Failed to open document");
    }
  };
  
  // Trigger file selection
  input.click();
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
               <MenubarItem onSelect={(e) => {
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
