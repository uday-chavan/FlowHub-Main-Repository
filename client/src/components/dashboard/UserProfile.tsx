
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { User, LogOut, Settings, ChevronDown, Camera, Save, X, RotateCcw, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useCurrentUser } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

interface UserData {
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

interface CropData {
  x: number;
  y: number;
  size: number;
  scale: number;
}

export function UserProfile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user: userAuth, isLoading, isAuthenticated } = useCurrentUser();
  const queryClient = useQueryClient();
  
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UserData>({
    email: '',
    firstName: '',
    lastName: '',
    profilePicture: ''
  });

  // Image cropping states
  const [showCropper, setShowCropper] = useState(false);
  const [originalImage, setOriginalImage] = useState<string>('');
  const [cropData, setCropData] = useState<CropData>({ x: 0, y: 0, size: 200, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Update editData when userAuth changes
  useEffect(() => {
    if (userAuth) {
      // Parse name if firstName/lastName not available
      let firstName = userAuth.firstName || '';
      let lastName = userAuth.lastName || '';
      
      if (!firstName && !lastName && userAuth.name) {
        const nameParts = userAuth.name.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
      }
      
      setEditData({
        email: userAuth.email || '',
        firstName,
        lastName,
        profilePicture: userAuth.profilePicture || userAuth.profileImageUrl || ''
      });
    }
  }, [userAuth]);

  const handleLogout = async () => {
    try {
      // Clear local storage first
      localStorage.removeItem('user_auth');
      
      // Call logout API
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      // Navigate to landing page and force refresh
      setLocation('/');
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      localStorage.removeItem('user_auth');
      setLocation('/');
      window.location.reload();
    }
  };

  const handleSaveProfile = async () => {
    try {
      console.log('Sending profile update:', editData);
      
      const response = await fetch('/api/auth/profile', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editData) 
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }

      const result = await response.json();
      console.log('Profile update response:', result);
      
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });

      // Invalidate and refetch user data to update the UI immediately
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/auth/me"]
      });
      
      // Force refetch to ensure immediate update
      await queryClient.refetchQueries({
        queryKey: ["/api/auth/me"]
      });
      
      // Small delay before closing modal to allow UI to update
      setTimeout(() => {
        setIsProfileModalOpen(false);
      }, 500);
      
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive"
        });
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive"
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setOriginalImage(result);
        setShowCropper(true);
        // Reset crop data for new image
        setCropData({ x: 50, y: 50, size: 200, scale: 1 });
      };
      reader.readAsDataURL(file);
    }
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  };

  // Draw the image and crop overlay
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const canvasSize = 400;
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scaled image dimensions
    const scaledWidth = image.naturalWidth * cropData.scale;
    const scaledHeight = image.naturalHeight * cropData.scale;
    
    // Center the image initially, then apply offset
    const imageX = (canvasSize - scaledWidth) / 2 + cropData.x;
    const imageY = (canvasSize - scaledHeight) / 2 + cropData.y;

    // Draw image
    ctx.drawImage(image, imageX, imageY, scaledWidth, scaledHeight);

    // Draw dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate crop area position (centered)
    const cropX = (canvasSize - cropData.size) / 2;
    const cropY = (canvasSize - cropData.size) / 2;

    // Clear crop area to show original image
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(cropX, cropY, cropData.size, cropData.size);
    
    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';

    // Draw crop border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropData.size, cropData.size);

    // Draw corner handles
    const handleSize = 12;
    ctx.fillStyle = '#3b82f6';
    
    // Top-left
    ctx.fillRect(cropX - handleSize/2, cropY - handleSize/2, handleSize, handleSize);
    // Top-right  
    ctx.fillRect(cropX + cropData.size - handleSize/2, cropY - handleSize/2, handleSize, handleSize);
    // Bottom-left
    ctx.fillRect(cropX - handleSize/2, cropY + cropData.size - handleSize/2, handleSize, handleSize);
    // Bottom-right
    ctx.fillRect(cropX + cropData.size - handleSize/2, cropY + cropData.size - handleSize/2, handleSize, handleSize);

  }, [originalImage, cropData]);

  // Generate cropped image
  const getCroppedImage = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    if (!canvas || !image) return '';

    // Create a temporary canvas for cropping
    const cropCanvas = document.createElement('canvas');
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return '';

    // Set output size to 200x200
    cropCanvas.width = 200;
    cropCanvas.height = 200;

    const canvasSize = 400;
    
    // Calculate scaled image dimensions and position
    const scaledWidth = image.naturalWidth * cropData.scale;
    const scaledHeight = image.naturalHeight * cropData.scale;
    const imageX = (canvasSize - scaledWidth) / 2 + cropData.x;
    const imageY = (canvasSize - scaledHeight) / 2 + cropData.y;
    
    // Calculate crop area
    const cropX = (canvasSize - cropData.size) / 2;
    const cropY = (canvasSize - cropData.size) / 2;
    
    // Calculate source rectangle from the scaled image
    const sourceX = Math.max(0, (cropX - imageX) * (image.naturalWidth / scaledWidth));
    const sourceY = Math.max(0, (cropY - imageY) * (image.naturalHeight / scaledHeight));
    const sourceWidth = cropData.size * (image.naturalWidth / scaledWidth);
    const sourceHeight = cropData.size * (image.naturalHeight / scaledHeight);

    // Draw cropped image
    ctx.drawImage(
      image,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, 200, 200
    );

    return cropCanvas.toDataURL('image/jpeg', 0.9);
  }, [cropData]);

  // Mouse handlers for cropping
  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const isInCropArea = (x: number, y: number) => {
    const canvasSize = 400;
    const cropX = (canvasSize - cropData.size) / 2;
    const cropY = (canvasSize - cropData.size) / 2;
    
    return x >= cropX && x <= cropX + cropData.size && 
           y >= cropY && y <= cropY + cropData.size;
  };

  const isOnHandle = (x: number, y: number) => {
    const canvasSize = 400;
    const cropX = (canvasSize - cropData.size) / 2;
    const cropY = (canvasSize - cropData.size) / 2;
    const handleSize = 12;
    
    const handles = [
      { x: cropX, y: cropY },
      { x: cropX + cropData.size, y: cropY },
      { x: cropX, y: cropY + cropData.size },
      { x: cropX + cropData.size, y: cropY + cropData.size }
    ];
    
    return handles.some(handle => 
      x >= handle.x - handleSize/2 && x <= handle.x + handleSize/2 &&
      y >= handle.y - handleSize/2 && y <= handle.y + handleSize/2
    );
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getMousePosition(e);
    
    if (isOnHandle(x, y)) {
      setIsResizing(true);
      setDragStart({ x, y });
    } else if (isInCropArea(x, y)) {
      setIsDragging(true);
      setDragStart({ x: x - cropData.x, y: y - cropData.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getMousePosition(e);
    
    if (isResizing) {
      const canvasSize = 400;
      const centerX = canvasSize / 2;
      const centerY = canvasSize / 2;
      
      // Calculate new size based on distance from center
      const distanceFromCenter = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
      );
      
      const newSize = Math.max(50, Math.min(300, distanceFromCenter * 2));
      setCropData(prev => ({ ...prev, size: newSize }));
      
    } else if (isDragging) {
      setCropData(prev => ({
        ...prev,
        x: x - dragStart.x,
        y: y - dragStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  // Crop controls
  const handleZoomIn = () => {
    setCropData(prev => ({ ...prev, scale: Math.min(prev.scale + 0.2, 5) }));
  };

  const handleZoomOut = () => {
    setCropData(prev => ({ ...prev, scale: Math.max(prev.scale - 0.2, 0.3) }));
  };

  const handleResetCrop = () => {
    setCropData({ x: 0, y: 0, size: 200, scale: 1 });
  };

  const handleApplyCrop = () => {
    const croppedImage = getCroppedImage();
    if (croppedImage) {
      // Force a re-render by updating the state immediately
      setEditData(prev => ({ ...prev, profilePicture: croppedImage }));
      setShowCropper(false);
      setOriginalImage('');
      
      // Force component re-render to show the new image immediately
      setTimeout(() => {
        setEditData(prev => ({ ...prev, profilePicture: croppedImage }));
      }, 50);
    }
  };

  const handleCancelCrop = () => {
    setShowCropper(false);
    setOriginalImage('');
  };

  // Update canvas when crop data changes
  useEffect(() => {
    if (showCropper && originalImage) {
      const timer = setTimeout(drawCanvas, 10);
      return () => clearTimeout(timer);
    }
  }, [showCropper, originalImage, cropData, drawCanvas]);

  if (isLoading) {
    return (
      <div className="flex items-center space-x-3">
        <div className="h-9 w-9 rounded-full bg-muted animate-pulse"></div>
        <div className="hidden md:flex flex-col space-y-1">
          <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
          <div className="h-3 w-24 bg-muted animate-pulse rounded"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !userAuth) {
    return null;
  }

  const getDisplayName = () => {
    if (!userAuth) return 'User';
    
    // Priority: firstName + lastName > name > email prefix
    if (userAuth.firstName && userAuth.lastName) {
      return `${userAuth.firstName} ${userAuth.lastName}`;
    }
    if (userAuth.firstName) {
      return userAuth.firstName;
    }
    if (userAuth.name && userAuth.name !== userAuth.email) {
      return userAuth.name;
    }
    if (userAuth.email) {
      return userAuth.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return 'User';
  };

  const userInitials = getDisplayName()
    .split(' ')
    .map((name: string) => name[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  // Get the current profile image URL with proper cache busting
  const getCurrentProfileImage = () => {
    // During editing, prioritize edit data
    if (isEditing && editData.profilePicture && editData.profilePicture.trim()) {
      return editData.profilePicture;
    }
    
    // Use saved user profile image
    const baseUrl = userAuth?.profilePicture || userAuth?.profileImageUrl;
    if (!baseUrl || baseUrl.trim() === '') return '';
    
    // Always add cache busting for all images to force refresh
    if (baseUrl.startsWith('data:')) {
      return baseUrl;
    }
    
    // Add timestamp for cache busting
    const timestamp = Date.now();
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}t=${timestamp}`;
  };

  return (
    <>
      <div className="flex items-center space-x-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="h-auto px-2 py-2 flex items-center space-x-2 hover:bg-accent/50 transition-colors rounded-lg"
              data-testid="user-profile-trigger"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage 
                  key={`main-${getCurrentProfileImage()}-${Date.now()}`}
                  src={getCurrentProfileImage()}
                  alt={userAuth?.email || 'User'}
                  className="object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                  onLoad={(e) => {
                    // Force a re-render when image loads
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'block';
                  }}
                />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium leading-none">
                  {getDisplayName()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {userAuth.email}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent 
            className="w-64" 
            align="start"
            data-testid="user-profile-menu"
          >
            <div className="flex items-center space-x-3 p-3">
              <Avatar className="h-9 w-9">
                <AvatarImage 
                  key={`dropdown-${getCurrentProfileImage()}-${Date.now()}`}
                  src={getCurrentProfileImage()}
                  alt={userAuth?.email || 'User'}
                  className="object-cover"
                />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {getDisplayName()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {userAuth.email}
                </p>
              </div>
            </div>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem 
              className="cursor-pointer" 
              onClick={() => setIsProfileModalOpen(true)}
              data-testid="profile-settings"
            >
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem 
              className="cursor-pointer text-red-600 focus:text-red-600" 
              onClick={handleLogout}
              data-testid="logout-button"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Profile Edit Modal */}
      <Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              User Profile
              {isEditing ? (
                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    onClick={handleSaveProfile}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditData({
                        email: userAuth?.email || '',
                        firstName: userAuth?.firstName || '',
                        lastName: userAuth?.lastName || '',
                        profilePicture: userAuth?.profilePicture || ''
                      });
                    }}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setIsEditing(true)}>
                  Edit Profile
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Profile Picture */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage 
                    key={isEditing ? editData.profilePicture : getCurrentProfileImage()}
                    src={isEditing ? editData.profilePicture : getCurrentProfileImage()} 
                    alt="Profile"
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-lg font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                {isEditing && (
                  <Label htmlFor="profile-upload" className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/90 transition-colors">
                    <Camera className="w-4 h-4" />
                    <input
                      id="profile-upload"
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </Label>
                )}
              </div>
              {!isEditing && (
                <div className="text-center">
                  <p className="font-medium text-lg">{getDisplayName()}</p>
                  <p className="text-sm text-muted-foreground">{userAuth.email}</p>
                </div>
              )}
            </div>

            {/* Edit Form */}
            {isEditing && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={editData.firstName}
                    onChange={(e) => setEditData(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Enter your first name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={editData.lastName}
                    onChange={(e) => setEditData(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Enter your last name"
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Cropper Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Crop Profile Picture</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Canvas for cropping */}
            <div className="flex justify-center">
              <div 
                ref={containerRef}
                className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-100"
                style={{ width: '400px', height: '400px' }}
              >
                <canvas
                  ref={canvasRef}
                  className="cursor-move select-none"
                  style={{ width: '100%', height: '100%' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="text-center text-sm text-gray-600 space-y-1">
              <p className="flex items-center justify-center gap-2">
                <Move className="w-4 h-4" />
                Drag the crop area to move it
              </p>
              <p>Drag the corners to resize the crop area</p>
            </div>

            {/* Crop Controls */}
            <div className="flex justify-center space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleZoomOut}
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleZoomIn}
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResetCrop}
                title="Reset"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={handleCancelCrop}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApplyCrop}
                className="bg-green-600 hover:bg-green-700"
              >
                Apply Crop
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden image element for processing */}
      {originalImage && (
        <img
          ref={imageRef}
          src={originalImage}
          alt="Original"
          className="hidden"
          onLoad={drawCanvas}
        />
      )}
    </>
  );
}
